"use client";

import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  InboxIcon,
  LoaderCircleIcon,
  LockIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useCopy, useNow } from "@/components/inbox/hooks";
import { useInboxRealtime } from "@/components/inbox/use-inbox-realtime";
import { Button } from "@/components/ui/button";
import { Skeleton, StatusDot } from "@/components/ui/misc";
import { api, ApiClientError } from "@/lib/api-client";
import type { InboxView, MessageSummaryView } from "@/lib/types";
import { avatarTone, cn, formatCountdown, formatRelativeTime, initials } from "@/lib/utils";

type PreviewState = "loading" | "idle" | "live" | "unavailable";

/**
 * Live preview of the visitor's own inbox. It never shows sample messages:
 * without an address it renders an empty skeleton, and once an address
 * exists it shows the real inbox, updated in real time.
 */
export function HeroInboxPreview() {
  const [state, setState] = useState<PreviewState>("loading");
  const [inbox, setInbox] = useState<InboxView | null>(null);
  const [messages, setMessages] = useState<MessageSummaryView[]>([]);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const { copied, copy } = useCopy();
  const now = useNow(1_000);

  const loadMessages = useCallback(async (): Promise<boolean> => {
    setRefreshing(true);
    try {
      const page = await api.listMessages({ limit: 3 });
      let changed = false;
      setTotal((previous) => {
        changed = previous !== page.total;
        return page.total;
      });
      setMessages(page.messages);
      return changed;
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 410)) {
        setInbox(null);
        setState("idle");
      }
      return false;
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .currentInbox()
      .then(({ inbox: current }) => {
        if (cancelled) return;
        setInbox(current);
        setState("live");
        void loadMessages();
      })
      .catch(() => {
        if (!cancelled) setState("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [loadMessages]);

  const connection = useInboxRealtime({
    enabled: state === "live",
    inboxKey: inbox?.id ?? null,
    onEvent: (event) => {
      if (event.type === "inbox.deleted") {
        setInbox(null);
        setState("idle");
      } else {
        void loadMessages();
      }
    },
    refresh: loadMessages,
  });

  const create = async () => {
    setCreating(true);
    try {
      const { inbox: created } = await api.createInbox({});
      setInbox(created);
      setMessages([]);
      setTotal(0);
      setState("live");
      toast.success("Your address is ready", { description: created.address });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "no_domains") setState("unavailable");
      else
        toast.error(
          error instanceof ApiClientError ? error.message : "Could not create an address.",
        );
    } finally {
      setCreating(false);
    }
  };

  const remaining = inbox ? Date.parse(inbox.expiresAt) - now : 0;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-x-6 -inset-y-8 -z-10 rounded-[2rem] bg-gradient-to-b from-blue-50 to-transparent"
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-float">
        <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-slate-200" />
            <span className="size-2.5 rounded-full bg-slate-200" />
            <span className="size-2.5 rounded-full bg-slate-200" />
          </span>
          <span className="mx-auto flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-[11px] text-muted-foreground shadow-soft">
            <LockIcon className="size-3" aria-hidden />
            Your private inbox
          </span>
          <span className="w-10" aria-hidden />
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Temporary address</p>
            {state === "live" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-green-700">
                <StatusDot tone="success" pulse={connection === "live"} />
                {connection === "live" ? "Live" : "Active"}
                {remaining > 0 ? (
                  <span className="tabular text-green-700/80">· {formatCountdown(remaining)}</span>
                ) : null}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-blue-100 bg-accent px-3.5">
              {state === "live" && inbox ? (
                <span className="truncate font-mono text-sm font-medium text-foreground">
                  {inbox.address}
                </span>
              ) : state === "loading" ? (
                <Skeleton className="h-4 w-48 bg-blue-100" />
              ) : (
                <span className="truncate text-sm text-muted-foreground">
                  Your address appears here
                </span>
              )}
            </div>
            {state === "live" && inbox ? (
              <Button
                size="icon"
                className="size-11 rounded-xl"
                aria-label="Copy address"
                onClick={async () => {
                  if (await copy(inbox.address)) toast.success("Address copied to clipboard");
                }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
            ) : (
              <Button
                className="h-11 rounded-xl"
                onClick={create}
                disabled={creating || state === "loading" || state === "unavailable"}
              >
                {creating ? <LoaderCircleIcon className="animate-spin" /> : null}
                Generate
              </Button>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <InboxIcon className="size-4 text-primary" aria-hidden />
              Inbox
              {state === "live" ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {total}
                </span>
              ) : null}
            </p>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <RefreshCwIcon
                className={cn("size-3", refreshing && "animate-spin text-primary")}
                aria-hidden
              />
              {state === "live"
                ? connection === "live"
                  ? "Updates instantly"
                  : "Auto-refreshing"
                : "Waiting"}
            </span>
          </div>

          <ul className="mt-3 space-y-2" aria-label="Recent messages">
            {state === "live" && messages.length > 0
              ? messages.map((message) => (
                  <li key={message.id}>
                    <Link
                      href={`/app?m=${message.id}`}
                      className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-blue-200 hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          avatarTone(message.from.address),
                        )}
                        aria-hidden
                      >
                        {initials(message.from.name, message.from.address)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "truncate text-sm",
                              message.read ? "font-medium" : "font-semibold",
                            )}
                          >
                            {message.from.name || message.from.address}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatRelativeTime(message.receivedAt, now)}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {message.subject || "(no subject)"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))
              : [0, 1, 2].map((index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3"
                    aria-hidden
                  >
                    <span className="size-9 shrink-0 rounded-full bg-slate-100" />
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3 w-1/3 rounded bg-slate-100" />
                      <span className="block h-2.5 w-2/3 rounded bg-slate-100/80" />
                    </span>
                  </li>
                ))}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">
            {state === "unavailable" ? (
              <span>Receiving domains are still being configured on this service.</span>
            ) : state === "live" ? (
              <>
                <span>
                  {messages.length === 0
                    ? "Send an email to this address to see it arrive."
                    : "Showing your latest messages."}
                </span>
                <Link
                  href="/app"
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:text-primary-strong"
                >
                  Open inbox
                  <ArrowRightIcon className="size-3.5" />
                </Link>
              </>
            ) : (
              <span>New messages appear here the moment they arrive.</span>
            )}
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium shadow-card sm:flex">
        <span className="flex size-6 items-center justify-center rounded-lg bg-success-soft">
          <ShieldCheckIcon className="size-3.5 text-success" aria-hidden />
        </span>
        Scripts & trackers blocked
      </div>
    </div>
  );
}
