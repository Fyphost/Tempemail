"use client";

import {
  CheckIcon,
  CopyIcon,
  HourglassIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  TimerIcon,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
} from "@/components/ui/menus";
import type { DomainOption, InboxView } from "@/lib/types";
import { cn, formatCountdown, formatDuration } from "@/lib/utils";

import { useCopy, useNow } from "./hooks";

export interface AddressCardProps {
  inbox: InboxView | null;
  expired: boolean;
  busy: "create" | "extend" | "delete" | null;
  domains: DomainOption[];
  selectedDomain: string | null;
  onSelectDomain: (domain: string) => void;
  /** Replacing deletes the current inbox (anonymous sessions keep one address). */
  replacesCurrent: boolean;
  lifetimeOptions: number[] | null;
  onCreate: (options: { ttlMinutes?: number }) => void;
  onExtend: () => void;
  onDelete: () => void;
  onCopied: () => void;
}

export function AddressCard(props: AddressCardProps) {
  const { inbox, expired, busy } = props;
  const now = useNow(1_000);
  const { copied, copy } = useCopy();
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ttl, setTtl] = useState<string>("");

  const remaining = inbox ? Date.parse(inbox.expiresAt) - now : 0;
  const total = inbox ? Date.parse(inbox.expiresAt) - Date.parse(inbox.createdAt) : 1;
  const ratio = inbox ? Math.max(0, Math.min(1, remaining / Math.max(total, 1))) : 0;
  const lowTime = remaining > 0 && remaining < 5 * 60_000;
  const isExpired = expired || (inbox !== null && remaining <= 0);

  const requestCreate = () => {
    if (inbox && !isExpired && props.replacesCurrent) setConfirmReplace(true);
    else props.onCreate({ ttlMinutes: ttl ? Number(ttl) : undefined });
  };

  return (
    <section
      aria-labelledby="address-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="address-heading" className="text-sm font-medium text-muted-foreground">
          Your temporary address
        </h2>
        {inbox ? (
          isExpired ? (
            <Badge variant="destructive">Expired</Badge>
          ) : (
            <Badge variant="success">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Active
            </Badge>
          )
        ) : null}
      </div>

      <div className="mt-3">
        {inbox ? (
          <button
            type="button"
            onClick={async () => {
              if (await copy(inbox.address)) props.onCopied();
            }}
            className={cn(
              "group w-full rounded-xl border border-blue-100 bg-accent px-3.5 py-3 text-left transition-colors hover:border-blue-200 focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:outline-none",
              isExpired && "border-border bg-muted opacity-70",
            )}
            aria-label={`Copy ${inbox.address}`}
          >
            <span className="block font-mono text-[15px] leading-snug font-medium break-all text-foreground">
              {inbox.address}
            </span>
            <span className="mt-1 block text-xs text-accent-foreground/80">
              {copied ? "Copied to clipboard" : "Click to copy"}
            </span>
          </button>
        ) : (
          <div className="rounded-xl border border-border bg-muted px-3.5 py-3">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="default"
          disabled={!inbox || isExpired}
          onClick={async () => {
            if (inbox && (await copy(inbox.address))) props.onCopied();
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="outline" onClick={requestCreate} disabled={busy !== null}>
          {busy === "create" ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
          New address
        </Button>
      </div>

      {props.domains.length > 1 || props.lifetimeOptions ? (
        <div className="mt-3 grid gap-2">
          {props.domains.length > 1 ? (
            <Select value={props.selectedDomain ?? undefined} onValueChange={props.onSelectDomain}>
              <SelectTrigger aria-label="Domain for new addresses" className="h-9">
                <SelectValue placeholder="Choose a domain" />
              </SelectTrigger>
              <SelectContent>
                {props.domains.map((domain) => (
                  <SelectItem key={domain.name} value={domain.name}>
                    @{domain.name}
                    {domain.premium ? " · Premium" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {props.lifetimeOptions ? (
            <Select value={ttl} onValueChange={setTtl}>
              <SelectTrigger aria-label="Lifetime for new addresses" className="h-9">
                <SelectValue placeholder="Default lifetime" />
              </SelectTrigger>
              <SelectContent>
                {props.lifetimeOptions.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    Keep for {formatDuration(minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}

      {inbox ? (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <TimerIcon className="size-4" aria-hidden />
              {isExpired ? "Expired" : "Expires in"}
            </span>
            <span
              className={cn(
                "tabular font-semibold",
                lowTime ? "text-destructive" : "text-foreground",
              )}
              aria-live="off"
            >
              {isExpired ? "00:00" : formatCountdown(remaining)}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-label="Remaining lifetime"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-1000 ease-linear",
                lowTime ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            {inbox.limits.extendMinutes > 0 ? (
              <Tooltip
                content={
                  inbox.limits.canExtend
                    ? `Adds ${formatDuration(inbox.limits.extendMinutes)}`
                    : "This address has reached its maximum lifetime"
                }
              >
                <span className="flex-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={!inbox.limits.canExtend || isExpired || busy !== null}
                    onClick={props.onExtend}
                  >
                    {busy === "extend" ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <HourglassIcon />
                    )}
                    Extend {formatDuration(inbox.limits.extendMinutes)}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <p className="flex-1 text-xs text-muted-foreground">
                Deleted automatically when the timer ends.
              </p>
            )}
            <Tooltip content="Delete address and messages">
              <Button
                variant="destructive-outline"
                size="icon-sm"
                aria-label="Delete address and all messages"
                disabled={busy !== null}
                onClick={() => setConfirmDelete(true)}
              >
                {busy === "delete" ? <LoaderCircleIcon className="animate-spin" /> : <TrashIcon />}
              </Button>
            </Tooltip>
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <div className="flex flex-col gap-2">
            <AlertDialogTitle>Replace your current address?</AlertDialogTitle>
            <AlertDialogDescription>
              {inbox?.address} and{" "}
              {inbox?.messageCount === 1
                ? "its message"
                : `its ${inbox?.messageCount ?? 0} messages`}{" "}
              will be deleted permanently. Emails sent to it afterwards will not be received.
            </AlertDialogDescription>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Keep current</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => props.onCreate({ ttlMinutes: ttl ? Number(ttl) : undefined })}
            >
              <PlusIcon className="size-4" />
              Create new address
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <div className="flex flex-col gap-2">
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>
              The address and every message in it are removed immediately. This cannot be undone.
            </AlertDialogDescription>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={props.onDelete}>
              Delete permanently
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
