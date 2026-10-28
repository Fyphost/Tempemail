"use client";

import { LoaderCircleIcon, PlusIcon, WifiOffIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { openOwnedInboxAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/menus";
import { api, ApiClientError } from "@/lib/api-client";
import type {
  DomainOption,
  InboxView,
  MessageDetailView,
  MessagePage,
  MessageSummaryView,
} from "@/lib/types";
import { cn } from "@/lib/utils";

import { AddressCard } from "./address-card";
import { EmptyInbox, ExpiredInbox, NoDomains, NoSearchResults } from "./empty-states";
import { MessageList, MessageListHeader, MessageListSkeleton } from "./message-list";
import { MessageReader, MessageReaderSkeleton } from "./message-reader";
import { DomainsCard, InboxNav, OwnedInboxesCard, PrivacyCard } from "./sidebar";
import { useInboxRealtime, type ConnectionState, type RealtimeEvent } from "./use-inbox-realtime";

type InboxState = "booting" | "ready" | "expired" | "deleted" | "no_domains" | "error";

export interface InboxAppProps {
  initialInbox: InboxView | null;
  initialState: "ready" | "expired" | "none";
  initialPage: MessagePage | null;
  domains: DomainOption[];
  defaultDomain: string | null;
  ownedInboxes: { id: string; address: string; expiresAt: string }[];
  lifetimeOptions: number[] | null;
  /** Anonymous sessions keep a single address, so "new address" replaces it. */
  replacesCurrent: boolean;
}

const EMPTY_PAGE: MessagePage = { messages: [], nextCursor: null, total: 0, unread: 0 };

function describeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "rate_limited" && error.retryAfterSeconds) {
      const minutes = Math.ceil(error.retryAfterSeconds / 60);
      return `${error.message} Try again in ${minutes > 1 ? `${minutes} minutes` : "a minute"}.`;
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function LiveStatus({ state }: { state: ConnectionState }) {
  const label = {
    live: "Live",
    connecting: "Connecting",
    polling: "Auto-refresh",
    paused: "Paused",
  }[state];
  const hint = {
    live: "New emails appear instantly over a live connection.",
    connecting: "Opening a live connection…",
    polling:
      "Live updates are unavailable on this network, so the inbox checks for new mail automatically.",
    paused: "Updates are paused.",
  }[state];
  return (
    <Tooltip content={hint}>
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        role="status"
      >
        {state === "polling" ? (
          <WifiOffIcon className="size-3 text-amber-600" aria-hidden />
        ) : (
          <StatusDot tone={state === "live" ? "success" : "muted"} pulse={state === "live"} />
        )}
        {label}
      </span>
    </Tooltip>
  );
}

export function InboxApp(props: InboxAppProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("m");

  const [inbox, setInbox] = useState<InboxView | null>(props.initialInbox);
  const [state, setState] = useState<InboxState>(() => {
    if (props.initialState === "ready") return "ready";
    if (props.initialState === "expired") return "expired";
    return props.domains.length === 0 ? "no_domains" : "booting";
  });
  const [page, setPageState] = useState<MessagePage>(props.initialPage ?? EMPTY_PAGE);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [busy, setBusy] = useState<"create" | "extend" | "delete" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Set on the first refresh after mount (the live connection refreshes as soon as it opens).
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(
    props.initialInbox?.domain ?? props.defaultDomain,
  );
  const [detail, setDetail] = useState<MessageDetailView | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const [switching, startSwitch] = useTransition();
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const pageRef = useRef(page);
  const seenIds = useRef(new Set((props.initialPage?.messages ?? []).map((message) => message.id)));
  const olderLoaded = useRef(false);
  const queryRef = useRef("");
  const autoCreated = useRef(false);
  const pushedMessage = useRef(false);
  const skipInitialFetch = useRef(Boolean(props.initialPage));

  const active = state === "ready" && inbox !== null;

  const setPage = useCallback((next: MessagePage | ((current: MessagePage) => MessagePage)) => {
    const value = typeof next === "function" ? next(pageRef.current) : next;
    pageRef.current = value;
    setPageState(value);
  }, []);

  /* ---------- message selection (URL ?m=) ---------- */

  const openMessage = useCallback((id: string) => {
    pushedMessage.current = true;
    window.history.pushState(null, "", `/app?m=${encodeURIComponent(id)}`);
  }, []);

  const closeMessage = useCallback(() => {
    if (pushedMessage.current) {
      pushedMessage.current = false;
      window.history.back();
    } else if (new URLSearchParams(window.location.search).has("m")) {
      window.history.replaceState(null, "", "/app");
    }
  }, []);

  /* ---------- data loading ---------- */

  const notifyNew = useCallback(
    (fresh: MessageSummaryView[]) => {
      if (fresh.length === 0) return;
      const latest = fresh[0]!;
      const sender = latest.from.name || latest.from.address || "Unknown sender";
      const title = fresh.length === 1 ? `New email from ${sender}` : `${fresh.length} new emails`;
      setAnnouncement(`${title}: ${latest.subject || "no subject"}`);
      toast.info(title, {
        description: latest.subject || "(no subject)",
        action:
          fresh.length === 1 ? { label: "Open", onClick: () => openMessage(latest.id) } : undefined,
      });
    },
    [openMessage],
  );

  /** Apply a freshly fetched first page; returns messages never seen before. */
  const applyFirstPage = useCallback(
    (next: MessagePage): MessageSummaryView[] => {
      const fresh = next.messages.filter((message) => !seenIds.current.has(message.id));
      for (const message of next.messages) seenIds.current.add(message.id);
      const previous = pageRef.current;
      let merged = next;
      if (olderLoaded.current && !queryRef.current) {
        const ids = new Set(next.messages.map((message) => message.id));
        const oldest = next.messages.at(-1)?.receivedAt ?? "";
        const older = previous.messages.filter(
          (message) => !ids.has(message.id) && message.receivedAt <= oldest,
        );
        merged = {
          ...next,
          messages: [...next.messages, ...older],
          nextCursor: previous.nextCursor,
        };
      }
      setPage(merged);
      setLastRefreshedAt(Date.now());
      if (fresh.length > 0 && !queryRef.current) {
        setNewIds(new Set(fresh.map((message) => message.id)));
        notifyNew(fresh);
      }
      return fresh;
    },
    [notifyNew, setPage],
  );

  const handleSessionError = useCallback((error: unknown): boolean => {
    if (!(error instanceof ApiClientError)) return false;
    if (error.code === "inbox_expired") {
      setState("expired");
      return true;
    }
    if (error.status === 401) {
      setState("deleted");
      return true;
    }
    return false;
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!active) return false;
    try {
      const next = await api.listMessages({ q: queryRef.current || undefined });
      const previousTotal = pageRef.current.total;
      const fresh = applyFirstPage(next);
      return fresh.length > 0 || next.total !== previousTotal;
    } catch (error) {
      handleSessionError(error);
      return false;
    }
  }, [active, applyFirstPage, handleSessionError]);

  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    await refresh();
    const elapsed = Date.now() - started;
    if (elapsed < 450) await new Promise((resolve) => setTimeout(resolve, 450 - elapsed));
    setRefreshing(false);
  }, [refresh]);

  /* ---------- search ---------- */

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    queryRef.current = debouncedQuery;
    if (!active) return;
    if (skipInitialFetch.current && !debouncedQuery) {
      skipInitialFetch.current = false;
      return;
    }
    skipInitialFetch.current = false;
    let cancelled = false;
    setListLoading(true);
    api
      .listMessages({ q: debouncedQuery || undefined })
      .then((next) => {
        if (cancelled) return;
        olderLoaded.current = false;
        for (const message of next.messages) seenIds.current.add(message.id);
        setPage(next);
        setLastRefreshedAt(Date.now());
      })
      .catch((error: unknown) => {
        if (!cancelled && !handleSessionError(error)) toast.error(describeError(error));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, active, inbox?.id, handleSessionError, setPage]);

  const loadMore = async () => {
    const cursor = pageRef.current.nextCursor;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const next = await api.listMessages({ q: queryRef.current || undefined, cursor });
      olderLoaded.current = true;
      for (const message of next.messages) seenIds.current.add(message.id);
      setPage((current) => {
        const known = new Set(current.messages.map((message) => message.id));
        return {
          ...current,
          messages: [
            ...current.messages,
            ...next.messages.filter((message) => !known.has(message.id)),
          ],
          nextCursor: next.nextCursor,
        };
      });
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setLoadingMore(false);
    }
  };

  /* ---------- realtime ---------- */

  const onRealtimeEvent = (event: RealtimeEvent) => {
    switch (event.type) {
      case "message.received":
        void refresh();
        break;
      case "message.deleted":
        setPage((current) => {
          const present = current.messages.some((message) => message.id === event.messageId);
          return {
            ...current,
            messages: current.messages.filter((message) => message.id !== event.messageId),
            total: Math.max(0, current.total - (present ? 1 : 0)),
          };
        });
        if (selectedId === event.messageId) closeMessage();
        break;
      case "inbox.updated":
        setInbox((current) => (current ? { ...current, expiresAt: event.expiresAt } : current));
        break;
      case "inbox.deleted":
        setState(event.reason === "expired" ? "expired" : "deleted");
        closeMessage();
        break;
    }
  };

  const connection = useInboxRealtime({
    enabled: active,
    inboxKey: inbox?.id ?? null,
    onEvent: onRealtimeEvent,
    refresh,
  });

  // Switch to the expired view the moment the countdown ends.
  useEffect(() => {
    if (!inbox || state !== "ready") return;
    const remaining = Math.max(0, Date.parse(inbox.expiresAt) - Date.now());
    const timer = setTimeout(() => setState("expired"), Math.min(remaining + 500, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [inbox, state]);

  /* ---------- inbox actions ---------- */

  const createAddress = useCallback(
    async (options: { ttlMinutes?: number }, replace: boolean) => {
      setBusy("create");
      try {
        const { inbox: created } = await api.createInbox({
          domain: selectedDomain ?? undefined,
          ttlMinutes: options.ttlMinutes,
          replaceCurrent: replace && props.replacesCurrent,
        });
        seenIds.current = new Set();
        olderLoaded.current = false;
        skipInitialFetch.current = false;
        setInbox(created);
        setPage(EMPTY_PAGE);
        setDetail(null);
        setQuery("");
        setState("ready");
        setLastRefreshedAt(Date.now());
        window.history.replaceState(null, "", "/app");
        toast.success("New address ready", { description: created.address });
        if (!props.replacesCurrent) router.refresh();
      } catch (error) {
        if (error instanceof ApiClientError && error.code === "no_domains") setState("no_domains");
        else setState((current) => (current === "booting" ? "error" : current));
        toast.error(describeError(error));
      } finally {
        setBusy(null);
      }
    },
    [selectedDomain, props.replacesCurrent, router, setPage],
  );

  useEffect(() => {
    if (state === "booting" && !autoCreated.current) {
      autoCreated.current = true;
      void createAddress({}, false);
    }
  }, [state, createAddress]);

  const extend = async () => {
    setBusy("extend");
    try {
      const { inbox: updated } = await api.extendInbox();
      setInbox(updated);
      toast.success("Lifetime extended", {
        description: `Now expires at ${new Date(updated.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      });
    } catch (error) {
      if (!handleSessionError(error)) toast.error(describeError(error));
    } finally {
      setBusy(null);
    }
  };

  const deleteAddress = async () => {
    setBusy("delete");
    try {
      await api.deleteInbox();
      setState("deleted");
      setPage(EMPTY_PAGE);
      closeMessage();
      toast.success("Address deleted", {
        description: "The address and all of its messages were removed.",
      });
      if (!props.replacesCurrent) router.refresh();
    } catch (error) {
      if (!handleSessionError(error)) toast.error(describeError(error));
    } finally {
      setBusy(null);
    }
  };

  const switchInbox = (id: string) => {
    setPendingSwitch(id);
    startSwitch(async () => {
      const result = await openOwnedInboxAction(id);
      if (!result.ok) {
        toast.error(result.error);
        setPendingSwitch(null);
        return;
      }
      // The page is keyed by inbox id, so refreshing remounts the app with the new inbox.
      window.history.replaceState(null, "", "/app");
      router.refresh();
    });
  };

  /* ---------- message detail ---------- */

  useEffect(() => {
    if (!selectedId || !active) return;
    let cancelled = false;
    api
      .getMessage(selectedId)
      .then(({ message }) => {
        if (cancelled) return;
        setDetail(message);
        setPage((current) => {
          const target = current.messages.find((m) => m.id === message.id);
          if (!target || target.read) return current;
          return {
            ...current,
            unread: Math.max(0, current.unread - 1),
            messages: current.messages.map((m) => (m.id === message.id ? { ...m, read: true } : m)),
          };
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (!handleSessionError(error)) {
          toast.error(
            error instanceof ApiClientError && error.status === 404
              ? "That message no longer exists."
              : describeError(error),
          );
        }
        pushedMessage.current = false;
        window.history.replaceState(null, "", "/app");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, active, handleSessionError, setPage]);

  const deleteMessage = async () => {
    if (!detail) return;
    const id = detail.id;
    try {
      await api.deleteMessage(id);
      setPage((current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== id),
        total: Math.max(0, current.total - 1),
      }));
      closeMessage();
      toast.success("Message deleted");
    } catch (error) {
      if (!handleSessionError(error)) toast.error(describeError(error));
    }
  };

  /* ---------- rendering ---------- */

  const showReader = Boolean(selectedId && active);
  const regenerate = (
    <Button onClick={() => void createAddress({}, false)} disabled={busy !== null} size="lg">
      {busy === "create" ? <LoaderCircleIcon className="animate-spin" /> : <PlusIcon />}
      Generate a new address
    </Button>
  );
  const owned = (
    <OwnedInboxesCard
      inboxes={props.ownedInboxes}
      currentId={inbox?.id ?? null}
      onOpen={switchInbox}
      pendingId={switching ? pendingSwitch : null}
    />
  );

  let main: React.ReactNode;
  if (state === "no_domains") main = <NoDomains />;
  else if (state === "expired" || state === "deleted") main = <ExpiredInbox action={regenerate} />;
  else if (state === "error")
    main = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t create an address right now.
        </p>
        {regenerate}
      </div>
    );
  else if (showReader)
    main =
      detail && detail.id === selectedId ? (
        <MessageReader
          message={detail}
          onBack={closeMessage}
          onDelete={() => void deleteMessage()}
          onCopied={() => toast.success("Message text copied")}
        />
      ) : (
        <MessageReaderSkeleton onBack={closeMessage} />
      );
  else
    main = (
      <>
        <MessageListHeader
          total={page.total}
          unread={page.unread}
          lastRefreshedAt={lastRefreshedAt}
          refreshing={refreshing}
          onRefresh={() => void manualRefresh()}
          query={query}
          onQueryChange={setQuery}
          status={active ? <LiveStatus state={connection} /> : null}
          disabled={!active}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {state === "booting" || (listLoading && page.messages.length === 0) ? (
            <MessageListSkeleton />
          ) : page.messages.length === 0 ? (
            debouncedQuery ? (
              <NoSearchResults query={debouncedQuery} />
            ) : (
              <EmptyInbox live={connection === "live"} />
            )
          ) : (
            <MessageList
              messages={page.messages}
              onOpen={openMessage}
              newIds={newIds}
              hasMore={Boolean(page.nextCursor)}
              loadingMore={loadingMore}
              onLoadMore={() => void loadMore()}
            />
          )}
        </div>
      </>
    );

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:h-full lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8 lg:py-6">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <aside
        className={cn(
          "flex scrollbar-thin flex-col gap-4 lg:-mr-2 lg:min-h-0 lg:overflow-y-auto lg:pr-2 lg:pb-2",
          showReader && "hidden lg:flex",
        )}
        aria-label="Address and inbox controls"
      >
        <AddressCard
          inbox={
            state === "deleted" || state === "booting" || state === "no_domains" ? null : inbox
          }
          expired={state === "expired"}
          busy={busy}
          domains={props.domains}
          selectedDomain={selectedDomain}
          onSelectDomain={setSelectedDomain}
          replacesCurrent={props.replacesCurrent}
          lifetimeOptions={props.lifetimeOptions}
          onCreate={(options) => void createAddress(options, true)}
          onExtend={() => void extend()}
          onDelete={() => void deleteAddress()}
          onCopied={() => toast.success("Address copied to clipboard")}
        />
        <div className="hidden flex-col gap-4 lg:flex">
          <InboxNav
            unread={page.unread}
            active={!showReader}
            onInbox={closeMessage}
            onRefresh={() => void manualRefresh()}
            refreshing={refreshing}
          />
          {owned}
          <DomainsCard
            domains={props.domains}
            selected={selectedDomain}
            onSelect={setSelectedDomain}
          />
          <PrivacyCard />
        </div>
      </aside>

      <section
        aria-label="Inbox"
        className="flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:min-h-0"
      >
        {main}
      </section>

      <div className={cn("flex flex-col gap-4 lg:hidden", showReader && "hidden")}>
        {owned}
        <DomainsCard
          domains={props.domains}
          selected={selectedDomain}
          onSelect={setSelectedDomain}
        />
        <PrivacyCard />
      </div>
    </div>
  );
}
