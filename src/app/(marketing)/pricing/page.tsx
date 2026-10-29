import { ArrowRightIcon, CheckIcon, MinusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PageHeader } from "@/components/marketing/sections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDuration } from "@/lib/utils";
import { getSettings, type PlanLimits } from "@/server/settings";

export const metadata: Metadata = {
  title: "Plans",
  description:
    "Compare what is included in the free temporary inbox and, where offered, the premium plan.",
  alternates: { canonical: "/pricing" },
};

type Row = { label: string; value: (limits: PlanLimits) => string | boolean };

const rows: Row[] = [
  { label: "Default address lifetime", value: (l) => formatDuration(l.inboxTtlMinutes) },
  { label: "Maximum lifetime with extensions", value: (l) => formatDuration(l.maxLifetimeMinutes) },
  {
    label: "Extension step",
    value: (l) => (l.extendMinutes > 0 ? formatDuration(l.extendMinutes) : false),
  },
  {
    label: "Addresses at the same time",
    value: (l) => (l.maxConcurrentInboxes === 1 ? "1" : String(l.maxConcurrentInboxes)),
  },
  { label: "New addresses per hour", value: (l) => String(l.inboxCreatesPerHour) },
  { label: "Messages kept per address", value: (l) => String(l.maxMessagesPerInbox) },
  {
    label: "Largest message accepted",
    value: (l) => `${Math.round(l.maxMessageSizeKb / 1024)} MB`,
  },
  { label: "Choose a custom lifetime", value: (l) => l.customRetention },
  { label: "API keys", value: (l) => l.apiKeys },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <CheckIcon className="mx-auto size-4 text-success" aria-label="Included" />;
  if (value === false)
    return (
      <MinusIcon className="mx-auto size-4 text-muted-foreground/60" aria-label="Not included" />
    );
  return <span className="font-medium text-foreground">{value}</span>;
}

export default async function PricingPage() {
  await connection();
  const settings = await getSettings();
  const premium = settings.premiumEnabled;
  const { free, premium: pro } = settings.plans;

  return (
    <>
      <PageHeader
        eyebrow="Plans"
        title={premium ? "Free for everyone, more room when you need it" : "Free for everyone"}
        description="The temporary inbox is free and needs no account. Limits below are the ones this service currently enforces."
      />
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className={cn("grid gap-6", premium && "md:grid-cols-2")}>
          <article className="flex flex-col rounded-2xl border border-border bg-card p-8 shadow-soft">
            <h2 className="text-lg font-semibold">Free</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Anonymous disposable inbox in your browser.
            </p>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">$0</span>
              <span className="text-sm text-muted-foreground">no account needed</span>
            </p>
            <ul className="mt-6 space-y-2.5 text-sm">
              <li className="flex gap-2">
                <CheckIcon className="mt-0.5 size-4 text-success" />
                Generate, copy and refresh addresses
              </li>
              <li className="flex gap-2">
                <CheckIcon className="mt-0.5 size-4 text-success" />
                Receive and read email in real time
              </li>
              <li className="flex gap-2">
                <CheckIcon className="mt-0.5 size-4 text-success" />
                Addresses last {formatDuration(free.inboxTtlMinutes)}
              </li>
              <li className="flex gap-2">
                <CheckIcon className="mt-0.5 size-4 text-success" />
                Messages up to {Math.round(free.maxMessageSizeKb / 1024)} MB
              </li>
            </ul>
            <Button asChild className="mt-8">
              <Link href="/app">
                Generate Free Email
                <ArrowRightIcon />
              </Link>
            </Button>
          </article>

          {premium ? (
            <article className="relative flex flex-col rounded-2xl border-2 border-primary bg-card p-8 shadow-card">
              <Badge variant="info" className="absolute -top-3 left-8">
                For heavy users and teams
              </Badge>
              <h2 className="text-lg font-semibold">Premium</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Longer retention, more addresses and API keys.
              </p>
              <p className="mt-6 text-sm text-muted-foreground">
                Premium is enabled on request for registered accounts. There is no online checkout.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm">
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 text-success" />
                  Up to {pro.maxConcurrentInboxes} addresses at once
                </li>
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 text-success" />
                  Keep addresses up to {formatDuration(pro.maxLifetimeMinutes)}
                </li>
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 text-success" />
                  Premium-only domains when available
                </li>
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 text-success" />
                  {pro.apiKeys ? "API keys with higher limits" : "Higher limits"}
                </li>
              </ul>
              <Button asChild variant="outline" className="mt-8">
                <Link href="/contact?topic=premium">Contact us about Premium</Link>
              </Button>
            </article>
          ) : null}
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <caption className="sr-only">Plan limits</caption>
            <thead className="bg-muted text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-5 py-3">
                  Limit
                </th>
                <th scope="col" className="px-5 py-3 text-center">
                  Free
                </th>
                {premium ? (
                  <th scope="col" className="px-5 py-3 text-center">
                    Premium
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className="px-5 py-3.5 text-left font-normal text-muted-foreground"
                  >
                    {row.label}
                  </th>
                  <td className="px-5 py-3.5 text-center">
                    <Cell value={row.value(free)} />
                  </td>
                  {premium ? (
                    <td className="px-5 py-3.5 text-center">
                      <Cell value={row.value(pro)} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!premium ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Premium plans are not offered at the moment. Every feature listed above is available for
            free.
          </p>
        ) : null}
      </div>
    </>
  );
}
