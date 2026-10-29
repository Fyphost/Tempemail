import { AdminPageHeader } from "@/components/admin/admin-shell";
import { SearchForm } from "@/components/admin/search-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { listAuditLogs } from "@/server/admin/service";
import { requireAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Audit log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const [rows, settings] = await Promise.all([
    listAuditLogs({ action: query || undefined, limit: 200 }),
    getSettings(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description={`Administrative and security events. Entries are kept for ${settings.retention.auditLogDays} days.`}
      />
      <div className="mb-4 max-w-md">
        <SearchForm
          action="/admin/audit"
          query={query}
          placeholder="Filter by action prefix, e.g. domain. or auth."
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  No events recorded.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                    {formatDateTime(row.createdAt.toISOString())}
                  </TableCell>
                  <TableCell className="text-sm">{row.actorLabel}</TableCell>
                  <TableCell className="font-mono text-xs">{row.action}</TableCell>
                  <TableCell className="max-w-52 truncate text-xs text-muted-foreground">
                    {row.targetType ? `${row.targetType}: ` : ""}
                    {row.targetId}
                  </TableCell>
                  <TableCell className="max-w-72 truncate font-mono text-[11px] text-muted-foreground">
                    {row.metadata ? JSON.stringify(row.metadata) : ""}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
