import Link from "next/link";

import { RetryJobButton } from "@/components/admin/action-buttons";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatBytes, formatDateTime } from "@/lib/utils";
import { listWebhookFailures, webhookFailureSummary } from "@/server/admin/service";
import { requireAdmin } from "@/server/auth/session";
import type { IngestStatus } from "@/server/db/schema";
import { listRecentJobs } from "@/server/jobs/queue";

export const metadata = { title: "Email processing" };

const filters: (IngestStatus | "all")[] = [
  "all",
  "failed",
  "rejected",
  "pending",
  "processing",
  "completed",
];
const statusTone: Record<
  IngestStatus,
  "success" | "warning" | "destructive" | "secondary" | "info"
> = {
  completed: "success",
  rejected: "warning",
  failed: "destructive",
  pending: "info",
  processing: "info",
};

export default async function AdminProcessingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status = filters.find((value) => value === params.status) ?? "all";
  const [jobs, failures, summary] = await Promise.all([
    listRecentJobs({ status: status === "all" ? undefined : status, limit: 100 }),
    listWebhookFailures(30),
    webhookFailureSummary(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Email processing"
        description="Every inbound message becomes a job: received → parsed → delivered. Failed jobs keep their payload so they can be retried."
      />
      <div className="mb-4 inline-flex flex-wrap rounded-lg bg-secondary p-1 text-sm">
        {filters.map((value) => (
          <Link
            key={value}
            href={`/admin/processing?status=${value}`}
            className={cn(
              "rounded-md px-3 py-1 capitalize",
              value === status
                ? "bg-background font-medium shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value}
          </Link>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  No jobs in the retention window.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                    {formatDateTime(job.createdAt.toISOString())}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusTone[job.status]} className="capitalize">
                      {job.status}
                    </Badge>
                    {job.attempts > 1 ? (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        ×{job.attempts}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs uppercase">{job.provider}</TableCell>
                  <TableCell className="max-w-56">
                    <p className="truncate font-mono text-xs" title={job.recipients.join(", ")}>
                      {job.recipients.join(", ")}
                    </p>
                  </TableCell>
                  <TableCell className="tabular text-xs">{formatBytes(job.rawSize)}</TableCell>
                  <TableCell className="max-w-72 text-xs">
                    {job.result ? (
                      <span>
                        {job.result.delivered} delivered
                        {job.result.duplicates ? ` · ${job.result.duplicates} duplicate` : ""}
                        {job.result.probes?.length ? ` · domain verified` : ""}
                      </span>
                    ) : null}
                    {job.lastError ? (
                      <p className="mt-0.5 truncate text-destructive" title={job.lastError}>
                        {job.lastError}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {job.status === "failed" && job.hasPayload ? (
                      <RetryJobButton id={job.id} />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Webhook failures by reason</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.length === 0 ? (
              <p className="text-sm text-muted-foreground">No webhook failures.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {summary.map((row) => (
                  <li
                    key={`${row.provider}-${row.reason}`}
                    className="flex items-center justify-between py-2"
                  >
                    <span>
                      <span className="font-medium uppercase">{row.provider}</span> ·{" "}
                      <span className="font-mono text-xs">{row.reason}</span>
                    </span>
                    <span className="tabular">{row.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent webhook failures</CardTitle>
            <CardDescription>
              Rejected deliveries with their HTTP status. Senders&apos; IPs are stored as hashes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {failures.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to show.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {failures.map((failure) => (
                  <li
                    key={failure.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant={failure.statusCode >= 500 ? "destructive" : "warning"}>
                        {failure.statusCode}
                      </Badge>
                      <span className="font-mono text-xs">{failure.reason}</span>
                      <span className="text-xs text-muted-foreground uppercase">
                        {failure.provider}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(failure.createdAt.toISOString())}
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
