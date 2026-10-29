import {
  ActivityIcon,
  CircleAlertIcon,
  DatabaseIcon,
  GlobeIcon,
  InboxIcon,
  MailCheckIcon,
  MailIcon,
  ServerCogIcon,
  WebhookIcon,
} from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatBytes, formatDateTime } from "@/lib/utils";
import { requireAdmin } from "@/server/auth/session";
import { getOverviewStats } from "@/server/admin/service";

export const metadata = { title: "Overview" };

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "destructive";
  href?: string;
}) {
  const body = (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-blue-200">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            tone === "success" && "bg-success-soft text-success",
            tone === "warning" && "bg-warning-soft text-warning",
            tone === "destructive" && "bg-destructive-soft text-destructive",
            tone === "default" && "bg-accent text-primary",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="tabular mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function BarChart({
  series,
  field,
  label,
}: {
  series: { day: string; inboxes: number; messages: number }[];
  field: "inboxes" | "messages";
  label: string;
}) {
  const max = Math.max(1, ...series.map((point) => point[field]));
  return (
    <figure>
      <div
        className="flex h-36 items-end gap-1.5"
        role="img"
        aria-label={`${label} per day for the last 14 days`}
      >
        {series.map((point) => (
          <div key={point.day} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="min-h-0.5 rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
              style={{ height: `${(point[field] / max) * 100}%` }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white group-hover:block">
              {point.day.slice(5)}: {point[field]}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{series[0]?.day.slice(5)}</span>
        <span>Today</span>
      </figcaption>
    </figure>
  );
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const stats = await getOverviewStats();
  const number = new Intl.NumberFormat("en");

  return (
    <>
      <AdminPageHeader
        title="Overview"
        description="Service health, delivery volume and storage at a glance."
      />
      {!stats.workers.some((worker) => worker.online) ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-destructive-soft p-4 text-sm text-red-900">
          <CircleAlertIcon className="size-5 shrink-0 text-destructive" />
          No worker is online. Incoming email is not being accepted over SMTP or processed from
          webhooks. Start the worker (`node dist/worker.mjs` or the `worker` compose service).
        </div>
      ) : null}
      {stats.domainsReceiving === 0 ? (
        <Link
          href="/admin/domains"
          className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200/70 bg-warning-soft p-4 text-sm text-amber-900"
        >
          <CircleAlertIcon className="size-5 shrink-0" />
          No domain is receiving mail yet, so visitors cannot create addresses. Add a domain and
          complete its DNS and test delivery checks.
        </Link>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Inboxes created"
          value={number.format(stats.totalInboxesCreated)}
          hint="All time"
          icon={InboxIcon}
          href="/admin/inboxes"
        />
        <Stat
          label="Active inboxes"
          value={number.format(stats.activeInboxes)}
          hint="Not yet expired"
          icon={MailIcon}
          tone="success"
        />
        <Stat
          label="Emails received"
          value={number.format(stats.totalEmailsReceived)}
          hint={`${number.format(stats.emailsRejected)} rejected`}
          icon={MailCheckIcon}
        />
        <Stat
          label="Receiving domains"
          value={`${stats.domainsReceiving} / ${stats.domainsTotal}`}
          hint="Verified and enabled"
          icon={GlobeIcon}
          tone={stats.domainsReceiving > 0 ? "success" : "warning"}
          href="/admin/domains"
        />
        <Stat
          label="Processed jobs"
          value={number.format(stats.jobsCompleted)}
          hint={`${stats.jobsPending} pending · retained window`}
          icon={ActivityIcon}
          href="/admin/processing"
        />
        <Stat
          label="Failed processing jobs"
          value={number.format(stats.jobsFailed)}
          hint="Retry from Email processing"
          icon={ServerCogIcon}
          tone={stats.jobsFailed > 0 ? "destructive" : "default"}
          href="/admin/processing"
        />
        <Stat
          label="Webhook failures"
          value={number.format(stats.webhookFailures24h)}
          hint="Last 24 hours"
          icon={WebhookIcon}
          tone={stats.webhookFailures24h > 0 ? "warning" : "default"}
          href="/admin/processing"
        />
        <Stat
          label="Storage used"
          value={formatBytes(stats.storage.databaseBytes)}
          hint={`Messages ${formatBytes(stats.storage.messageBytes)} · files ${formatBytes(stats.storage.attachmentBytes)}`}
          icon={DatabaseIcon}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Emails received</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart series={stats.series} field="messages" label="Emails received" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inboxes created</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart series={stats.series} field="inboxes" label="Inboxes created" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>API request volume</CardTitle>
            <CardDescription>Requests handled by the REST API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="tabular text-3xl font-semibold tracking-tight">
                {number.format(stats.apiRequestsToday)}
              </p>
              <p className="text-xs text-muted-foreground">Today (UTC)</p>
            </div>
            <div>
              <p className="tabular text-xl font-semibold">{number.format(stats.apiRequests7d)}</p>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Workers</CardTitle>
            <CardDescription>
              Processes that run the SMTP server, the ingestion queue and scheduled cleanup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.workers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No worker has reported in yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {stats.workers.map((worker) => (
                  <li key={worker.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Badge variant={worker.online ? "success" : "destructive"}>
                      {worker.online ? "Online" : "Offline"}
                    </Badge>
                    <span className="font-mono text-xs">{worker.id}</span>
                    <span className="text-xs text-muted-foreground">
                      {worker.smtpListening
                        ? `SMTP on port ${worker.smtpPort}${worker.smtpTls ? " with STARTTLS" : " without STARTTLS"}`
                        : "SMTP disabled (webhook ingestion only)"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Last seen {formatDateTime(worker.lastSeenAt.toISOString())}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
