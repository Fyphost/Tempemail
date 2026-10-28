"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import { usePageVisible } from "./hooks";

export type RealtimeEvent =
  | { type: "message.received"; messageId: string }
  | { type: "message.deleted"; messageId: string }
  | { type: "inbox.updated"; expiresAt: string }
  | { type: "inbox.deleted"; reason: "deleted" | "expired" };

export type ConnectionState = "connecting" | "live" | "polling" | "paused";

const EVENT_TYPES = [
  "message.received",
  "message.deleted",
  "inbox.updated",
  "inbox.deleted",
] as const;
const MAX_SSE_FAILURES = 3;
const POLL_MIN_MS = 5_000;
const POLL_MAX_MS = 30_000;
const POLL_HIDDEN_MS = 60_000;
/** Safety refresh while live, in case a notification was missed. */
const LIVE_RESYNC_MS = 60_000;
const SSE_RETRY_FROM_POLLING_MS = 60_000;

/**
 * Real-time inbox updates over Server-Sent Events, falling back to adaptive
 * polling (5s → 30s while idle, slower in background tabs) when a live
 * connection cannot be kept open. `refresh` must resolve to true when it found
 * new data, which resets the polling interval.
 */
export function useInboxRealtime({
  enabled,
  inboxKey,
  onEvent,
  refresh,
}: {
  enabled: boolean;
  /** Changing the key (new inbox) restarts the connection. */
  inboxKey: string | null;
  onEvent: (event: RealtimeEvent) => void;
  refresh: () => Promise<boolean>;
}): ConnectionState {
  const [state, setState] = useState<ConnectionState>("connecting");
  const visible = usePageVisible();
  const failures = useRef(0);
  const pollDelay = useRef(POLL_MIN_MS);
  const mode = useRef<"sse" | "polling">("sse");

  const handleEvent = useEffectEvent(onEvent);
  const runRefresh = useEffectEvent(refresh);

  useEffect(() => {
    // The returned state is derived as "paused" while disabled.
    if (!enabled || !inboxKey) return;

    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let resyncTimer: ReturnType<typeof setInterval> | null = null;
    let retrySseTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const clearTimers = () => {
      if (pollTimer) clearTimeout(pollTimer);
      if (resyncTimer) clearInterval(resyncTimer);
      if (retrySseTimer) clearTimeout(retrySseTimer);
      pollTimer = resyncTimer = retrySseTimer = null;
    };

    const schedulePoll = () => {
      if (disposed) return;
      const delay = document.visibilityState === "hidden" ? POLL_HIDDEN_MS : pollDelay.current;
      pollTimer = setTimeout(async () => {
        const changed = await runRefresh().catch(() => false);
        pollDelay.current = changed
          ? POLL_MIN_MS
          : Math.min(Math.round(pollDelay.current * 1.5), POLL_MAX_MS);
        schedulePoll();
      }, delay);
    };

    const startPolling = () => {
      mode.current = "polling";
      setState("polling");
      pollDelay.current = POLL_MIN_MS;
      schedulePoll();
      retrySseTimer = setTimeout(() => {
        if (disposed) return;
        clearTimers();
        failures.current = 0;
        connect();
      }, SSE_RETRY_FROM_POLLING_MS);
    };

    const connect = () => {
      if (disposed) return;
      if (typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      mode.current = "sse";
      setState("connecting");
      source = new EventSource("/api/inboxes/current/events");

      source.addEventListener("ready", () => {
        failures.current = 0;
        setState("live");
        void runRefresh();
        if (!resyncTimer) resyncTimer = setInterval(() => void runRefresh(), LIVE_RESYNC_MS);
      });

      for (const type of EVENT_TYPES) {
        source.addEventListener(type, (message) => {
          try {
            handleEvent(JSON.parse((message as MessageEvent<string>).data) as RealtimeEvent);
          } catch {
            // ignore malformed frames
          }
        });
      }

      source.addEventListener("reconnect", () => {
        source?.close();
        source = null;
        setTimeout(connect, 500 + Math.random() * 1_000);
      });

      source.onerror = () => {
        if (disposed) return;
        // EventSource retries on its own; count consecutive failures and fall
        // back to polling if the stream keeps dropping (e.g. a buffering proxy).
        failures.current += 1;
        setState("connecting");
        if (failures.current >= MAX_SSE_FAILURES || source?.readyState === EventSource.CLOSED) {
          source?.close();
          source = null;
          if (resyncTimer) clearInterval(resyncTimer);
          resyncTimer = null;
          startPolling();
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      source?.close();
      clearTimers();
    };
  }, [enabled, inboxKey]);

  // Refresh promptly when the tab becomes visible again.
  useEffect(() => {
    if (visible && enabled && inboxKey) {
      pollDelay.current = POLL_MIN_MS;
      void runRefresh();
    }
  }, [visible, enabled, inboxKey]);

  return enabled && inboxKey ? state : "paused";
}
