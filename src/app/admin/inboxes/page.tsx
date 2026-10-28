import Link from "next/link";

import { BlockNetworkDialog, DeleteInboxButton } from "@/components/admin/action-buttons";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { SearchForm } from "@/components/admin/search-form";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDateTime } from "@/lib/utils";
import { searchInboxes } from "@/server/admin/service";
import { requireAdmin } from "@/server/auth/session";

export const metadata = { title: "Inboxes" };

const statuses = ["active", "expired", "all"] as const;

export default async function AdminInboxesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const status = statuses.find((value) => value === params.status) ?? "active";
  const page = Math.max(1, Number(params.page) || 1);
  const { rows, total } = await searchInboxes({ query: query || undefined, status, page });
  const pages = Math.max(1, Math.ceil(total / 25));
  const href = (next: Partial<{ status: string; page: number }>) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    search.set("status", next.status ?? status);
    search.set("page", String(next.page ?? 1));
    return `/admin/inboxes?${search.toString()}`;
  };

  return (
    <>
      <AdminPageHeader
        title="Inboxes"
        description="Search addresses, check expiry and remove abusive inboxes."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-secondary p-1 text-sm">
          {statuses.map((value) => (
            <Link
              key={value}
              href={href({ status: value })}
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
        <div className="w-full max-w-lg">
          <SearchForm
            action="/admin/inboxes"
            query={query}
            placeholder="Search by address, inbox ID or owner email"
          >
            <input type="hidden" name="status" value={status} />
          </SearchForm>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Messages</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  No inboxes match.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const expired = row.expired;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-mono text-[13px] font-medium">{row.address}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{row.publicId}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                        {row.plan === "premium" ? <Badge variant="info">Premium</Badge> : null}
                        {row.blocked ? <Badge variant="warning">Network blocked</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="tabular">{row.messageCount}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.createdAt.toISOString())}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.expiresAt.toISOString())}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.ownerEmail ?? "Anonymous"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {row.createdIpHash && !row.blocked ? (
                          <BlockNetworkDialog
                            ipHash={row.createdIpHash}
                            label={`Creator of ${row.address}.`}
                          />
                        ) : null}
                        <DeleteInboxButton id={row.id} address={row.address} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} inbox{total === 1 ? "" : "es"} · page {page} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              className="rounded-lg border border-border bg-background px-3 py-1.5 hover:bg-secondary"
              href={href({ page: page - 1 })}
            >
              Previous
            </Link>
          ) : null}
          {page < pages ? (
            <Link
              className="rounded-lg border border-border bg-background px-3 py-1.5 hover:bg-secondary"
              href={href({ page: page + 1 })}
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
