"use client";

import { LoaderCircleIcon, PaperclipIcon, RefreshCwIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, Skeleton } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/menus";
import type { MessageSummaryView } from "@/lib/types";
import { avatarTone, cn, formatRelativeTime, formatTime, initials } from "@/lib/utils";

import { useNow } from "./hooks";

export function SenderAvatar({
  name,
  address,
  className,
}: {
  name: string;
  address: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        avatarTone(address || name),
        className,
      )}
    >
      {initials(name, address)}
    </span>
  );
}

function MessageRow({
  message,
  onOpen,
  isNew,
}: {
  message: MessageSummaryView;
  onOpen: (id: string) => void;
  isNew: boolean;
}) {
  const sender = message.from.name || message.from.address || "Unknown sender";
  const received = new Date(message.receivedAt);
  const today = new Date().toDateString() === received.toDateString();
  return (
    <li className={cn(isNew && "animate-slide-in")}>
      <button
        type="button"
        onClick={() => onOpen(message.id)}
        className={cn(
          "group relative flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors hover:bg-muted focus-visible:bg-accent focus-visible:outline-none sm:px-5",
          !message.read && "bg-white",
        )}
        aria-label={`${message.read ? "" : "Unread. "}From ${sender}. ${message.subject || "No subject"}`}
      >
        {!message.read ? (
          <span
            className="absolute top-1/2 left-1.5 size-2 -translate-y-1/2 rounded-full bg-primary sm:left-2"
            aria-hidden
          />
        ) : null}
        <SenderAvatar name={message.from.name} address={message.from.address} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                "truncate text-sm",
                message.read ? "font-medium text-foreground/80" : "font-semibold text-foreground",
              )}
            >
              {sender}
            </span>
            <time
              dateTime={message.receivedAt}
              className={cn(
                "tabular shrink-0 text-xs",
                message.read ? "text-muted-foreground" : "font-medium text-primary",
              )}
            >
              {today ? formatTime(message.receivedAt) : received.toLocaleDateString()}
            </time>
          </span>
          {message.from.name && message.from.address ? (
            <span className="block truncate text-xs text-muted-foreground">
              {message.from.address}
            </span>
          ) : null}
          <span
            className={cn(
              "mt-1 flex items-center gap-1.5 text-sm",
              message.read ? "text-foreground/80" : "font-medium text-foreground",
            )}
          >
            <span className="truncate">{message.subject || "(no subject)"}</span>
            {message.attachmentCount > 0 ? (
              <PaperclipIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label="Has attachments"
              />
            ) : null}
          </span>
          <span className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">
            {message.preview || "No preview available"}
          </span>
        </span>
      </button>
    </li>
  );
}

export function MessageListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul aria-hidden className="divide-y divide-border">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-start gap-3.5 px-4 py-4 sm:px-5">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="flex justify-between gap-6">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface MessageListHeaderProps {
  total: number;
  unread: number;
  lastRefreshedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  status: React.ReactNode;
  disabled?: boolean;
}

export function MessageListHeader(props: MessageListHeaderProps) {
  const now = useNow(10_000);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="border-b border-border px-4 pt-4 pb-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold tracking-tight">Inbox</h2>
            {props.status}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
            {props.total === 0
              ? "No messages yet"
              : `${props.total} message${props.total === 1 ? "" : "s"}${props.unread > 0 ? ` · ${props.unread} unread` : ""}`}
            {props.lastRefreshedAt ? (
              <>
                {" · "}Updated{" "}
                {formatRelativeTime(new Date(props.lastRefreshedAt).toISOString(), now)}
              </>
            ) : null}
          </p>
        </div>
        <Tooltip content="Refresh inbox">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={props.onRefresh}
            disabled={props.disabled || props.refreshing}
            aria-label="Refresh inbox"
          >
            <RefreshCwIcon className={cn(props.refreshing && "animate-spin")} />
          </Button>
        </Tooltip>
      </div>
      <div className="relative mt-3">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={searchRef}
          type="search"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Search messages"
          aria-label="Search messages"
          className="h-9 bg-muted pr-16 pl-9 shadow-none focus-visible:bg-background [&::-webkit-search-cancel-button]:hidden"
          disabled={props.disabled}
        />
        <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          {props.query ? (
            <button
              type="button"
              onClick={() => props.onQueryChange("")}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Clear search"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : (
            <Kbd className="hidden sm:inline-flex">/</Kbd>
          )}
        </span>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  onOpen,
  newIds,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  messages: MessageSummaryView[];
  onOpen: (id: string) => void;
  newIds: Set<string>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div>
      <ul className="divide-y divide-border" aria-label="Messages">
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            onOpen={onOpen}
            isNew={newIds.has(message.id)}
          />
        ))}
      </ul>
      {hasMore ? (
        <div className="border-t border-border p-3 text-center">
          <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <LoaderCircleIcon className="animate-spin" /> : null}
            Load older messages
          </Button>
        </div>
      ) : null}
    </div>
  );
}
