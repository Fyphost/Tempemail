import { UserControls } from "@/components/admin/action-buttons";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
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
import { formatDateTime } from "@/lib/utils";
import { listUsers } from "@/server/admin/service";
import { requireAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const [rows, settings] = await Promise.all([listUsers(query || undefined), getSettings()]);

  return (
    <>
      <AdminPageHeader
        title="Users"
        description={
          settings.premiumEnabled
            ? "Manage accounts, roles and plans. Premium limits apply to accounts on the Premium plan."
            : "Manage accounts and roles. Premium is disabled in Settings, so every account currently gets Free limits."
        }
        actions={<CreateUserDialog />}
      />
      <div className="mb-4 max-w-md">
        <SearchForm action="/admin/users" query={query} placeholder="Search by email" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active inboxes</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="text-right">Plan · role · access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {formatDateTime(row.createdAt.toISOString())}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.status === "active" ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                      {row.role === "admin" ? <Badge variant="info">Admin</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="tabular">{row.inboxCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.lastLoginAt ? formatDateTime(row.lastLoginAt.toISOString()) : "Never"}
                  </TableCell>
                  <TableCell>
                    <UserControls
                      id={row.id}
                      role={row.role}
                      plan={row.plan}
                      status={row.status}
                      isSelf={row.id === admin.id}
                    />
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
