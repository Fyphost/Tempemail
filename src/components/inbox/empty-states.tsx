import { InboxIcon, ServerCogIcon, TimerOffIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function InboxIllustration({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto size-28", className)} aria-hidden>
      <div className="absolute inset-0 rounded-full bg-accent" />
      <div className="absolute inset-3 rounded-full border border-dashed border-blue-200 motion-safe:animate-[spin_24s_linear_infinite]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-blue-100 bg-white shadow-card">
          <InboxIcon className="size-7 text-primary" strokeWidth={1.75} />
        </div>
      </div>
      <span className="absolute top-4 right-3 size-2.5 rounded-full bg-primary/70 motion-safe:animate-pulse" />
      <span className="absolute bottom-5 left-3 size-1.5 rounded-full bg-primary/40" />
    </div>
  );
}

function StateShell({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      {icon}
      <h3 className="mt-6 text-lg font-semibold tracking-tight">{title}</h3>
      <div className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{children}</div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function EmptyInbox({ live }: { live: boolean }) {
  return (
    <StateShell icon={<InboxIllustration />} title="Your inbox is waiting.">
      <p>Emails sent to your temporary address will appear here.</p>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        <span className="relative inline-flex size-2">
          <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-primary" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        {live ? "Listening for new mail in real time" : "Checking for new mail automatically"}
      </p>
    </StateShell>
  );
}

export function NoSearchResults({ query }: { query: string }) {
  return (
    <StateShell
      icon={
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <InboxIcon className="size-6 text-muted-foreground" />
        </div>
      }
      title="No matching messages"
    >
      Nothing in this inbox matches “{query}”.
    </StateShell>
  );
}

export function ExpiredInbox({ action }: { action: ReactNode }) {
  return (
    <StateShell
      icon={
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive-soft">
          <TimerOffIcon className="size-7 text-destructive" strokeWidth={1.75} />
        </div>
      }
      title="This address has expired"
      action={action}
    >
      Its messages have been deleted and new emails to it are no longer accepted. Generate a fresh
      address to keep receiving mail.
    </StateShell>
  );
}

export function NoDomains() {
  return (
    <StateShell
      icon={
        <div className="flex size-16 items-center justify-center rounded-2xl bg-warning-soft">
          <ServerCogIcon className="size-7 text-warning" strokeWidth={1.75} />
        </div>
      }
      title="Receiving is not set up yet"
    >
      No email domain has been verified for receiving on this service, so addresses cannot be
      created yet. An administrator needs to add a domain, point its MX records here and confirm a
      test delivery.
    </StateShell>
  );
}
