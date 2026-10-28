import { BanIcon } from "lucide-react";

import { BlockNetworkDialog, UnblockButton } from "@/components/admin/action-buttons";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { listIpBlocks } from "@/server/admin/service";
import { requireAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Abuse & blocks" };

export default async function AdminAbusePage() {
  await requireAdmin();
  const [blocks, settings] = await Promise.all([listIpBlocks(), getSettings()]);
  const limits = settings.rateLimits;

  return (
    <>
      <AdminPageHeader
        title="Abuse & blocks"
        description="Block networks that abuse the service. Rate limits are configured under Settings."
        actions={
          <BlockNetworkDialog
            trigger={
              <Button variant="destructive">
                <BanIcon />
                Block an IP address
              </Button>
            }
          />
        }
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Network</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Blocked by</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  No active blocks.
                </TableCell>
              </TableRow>
            ) : (
              blocks.map((block) => (
                <TableRow key={block.id}>
                  <TableCell>
                    <p className="font-medium">{block.label}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      hash {block.ipHash.slice(0, 12)}…
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{block.reason}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {block.createdBy ?? "system"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(block.createdAt.toISOString())}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {block.expiresAt ? formatDateTime(block.expiresAt.toISOString()) : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <UnblockButton id={block.id} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Active rate limits</CardTitle>
          <CardDescription>Automatic protections applied to every client.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {[
              ["API requests per IP / minute", limits.apiRequestsPerMinute],
              ["Free addresses per IP / hour", settings.plans.free.inboxCreatesPerHour],
              ["Premium addresses per account / hour", settings.plans.premium.inboxCreatesPerHour],
              ["Inbound messages per inbox / minute", limits.inboundPerInboxPerMinute],
              ["SMTP connections per IP / minute", limits.smtpConnectionsPerMinute],
              ["Sign-in attempts per account / 15 min", limits.loginAttemptsPer15Minutes],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border border-border bg-muted p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="tabular mt-1 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
