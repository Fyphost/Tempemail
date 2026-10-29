"use client";

import {
  GlobeIcon,
  InboxIcon,
  LockIcon,
  MailIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";

import type { DomainOption } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

import { useNow } from "./hooks";

export function InboxNav({
  unread,
  active,
  onInbox,
  onRefresh,
  refreshing,
}: {
  unread: number;
  active: boolean;
  onInbox: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:outline-none";
  return (
    <nav
      aria-label="Inbox navigation"
      className="rounded-2xl border border-border bg-card p-2 shadow-soft"
    >
      <button
        type="button"
        onClick={onInbox}
        aria-current={active ? "page" : undefined}
        className={cn(
          item,
          active ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-secondary",
        )}
      >
        <InboxIcon className="size-4" />
        Inbox
        {unread > 0 ? (
          <span className="tabular ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
            {unread}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className={cn(item, "text-foreground/80 hover:bg-secondary disabled:opacity-60")}
      >
        <RefreshCwIcon className={cn("size-4", refreshing && "animate-spin")} />
        Refresh
      </button>
    </nav>
  );
}

export function DomainsCard({
  domains,
  selected,
  onSelect,
}: {
  domains: DomainOption[];
  selected: string | null;
  onSelect: (domain: string) => void;
}) {
  if (domains.length === 0) return null;
  return (
    <section
      aria-labelledby="domains-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-soft"
    >
      <h2 id="domains-heading" className="flex items-center gap-2 text-sm font-semibold">
        <GlobeIcon className="size-4 text-primary" />
        Available domains
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Verified for receiving. Used for your next new address.
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {domains.map((domain) => (
          <li key={domain.name}>
            <button
              type="button"
              onClick={() => onSelect(domain.name)}
              aria-pressed={selected === domain.name}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:outline-none",
                selected === domain.name
                  ? "border-blue-200 bg-accent text-accent-foreground"
                  : "border-border bg-background text-foreground/80 hover:bg-secondary",
              )}
            >
              @{domain.name}
              {domain.premium ? <span className="ml-1 text-[10px] text-primary">PRO</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OwnedInboxesCard({
  inboxes,
  currentId,
  onOpen,
  pendingId,
}: {
  inboxes: { id: string; address: string; expiresAt: string }[];
  currentId: string | null;
  onOpen: (id: string) => void;
  pendingId: string | null;
}) {
  const now = useNow(30_000);
  if (inboxes.length === 0) return null;
  return (
    <section
      aria-labelledby="owned-heading"
      className="rounded-2xl border border-border bg-card p-2 shadow-soft"
    >
      <h2
        id="owned-heading"
        className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Your addresses
      </h2>
      <ul>
        {inboxes.map((inbox) => (
          <li key={inbox.id}>
            <button
              type="button"
              disabled={inbox.id === currentId || pendingId !== null}
              onClick={() => onOpen(inbox.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-default",
                inbox.id === currentId ? "bg-accent text-accent-foreground" : "hover:bg-secondary",
              )}
            >
              <MailIcon className="size-4 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{inbox.address}</span>
                <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                  Expires {formatRelativeTime(inbox.expiresAt, now)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PrivacyCard() {
  return (
    <section
      aria-labelledby="privacy-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-soft"
    >
      <h2 id="privacy-heading" className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheckIcon className="size-4 text-success" />
        Privacy
      </h2>
      <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted-foreground">
        <li className="flex gap-2">
          <LockIcon className="mt-0.5 size-3.5 shrink-0 text-foreground/60" />
          <span>
            Only this browser session can open this inbox. Knowing the address is not enough, but
            anyone who obtains your session cookie or API token could read it.
          </span>
        </li>
        <li className="flex gap-2">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-foreground/60" />
          <span>
            Emails are displayed in a sandbox. Scripts never run and remote images stay hidden until
            you allow them.
          </span>
        </li>
        <li className="flex gap-2">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          <span>
            Don&apos;t use temporary addresses for banking, password recovery or accounts you need
            to keep.{" "}
            <Link
              href="/privacy"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Privacy policy
            </Link>
          </span>
        </li>
      </ul>
    </section>
  );
}
