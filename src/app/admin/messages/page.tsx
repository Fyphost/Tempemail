import Link from "next/link";

import { ContactStatusButton } from "@/components/admin/action-buttons";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { contactTopicLabels, type ContactTopic } from "@/lib/contact";
import { cn, formatDateTime } from "@/lib/utils";
import { listContactRequests } from "@/server/admin/service";
import { requireAdmin } from "@/server/auth/session";

export const metadata = { title: "Contact requests" };

const filters = ["open", "closed", "all"] as const;

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status = filters.find((value) => value === params.status) ?? "open";
  const rows = await listContactRequests(status);

  return (
    <>
      <AdminPageHeader
        title="Contact requests"
        description="Messages sent through the contact form, including abuse reports and Premium requests."
      />
      <div className="mb-4 inline-flex rounded-lg bg-secondary p-1 text-sm">
        {filters.map((value) => (
          <Link
            key={value}
            href={`/admin/messages?status=${value}`}
            className={cn(
              "rounded-md px-3 py-1 capitalize",
              value === status ? "bg-background font-medium shadow-soft" : "text-muted-foreground",
            )}
          >
            {value}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No messages.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{row.name}</p>
                <a href={`mailto:${row.email}`} className="text-sm text-primary hover:underline">
                  {row.email}
                </a>
                <Badge variant={row.topic === "abuse" ? "destructive" : "secondary"}>
                  {contactTopicLabels[row.topic as ContactTopic] ?? row.topic}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(row.createdAt.toISOString())}
                </span>
              </div>
              <p className="mt-3 text-sm whitespace-pre-wrap text-foreground/85">{row.message}</p>
              <div className="mt-4 flex justify-end">
                <ContactStatusButton id={row.id} status={row.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
