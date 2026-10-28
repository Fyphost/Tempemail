import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { writeAudit, type AuditActor } from "@/server/audit";
import { getDb } from "@/server/db/client";
import {
  auditLogs,
  contactRequests,
  dailyStats,
  domains,
  inboxes,
  ingestJobs,
  ipBlocks,
  users,
  webhookFailures,
} from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import { deleteInboxById } from "@/server/inboxes/service";
import { hashIp, maskIp, normalizeIp } from "@/server/security/ip";
import { utcDay } from "@/server/stats";

const DAY = 86_400_000;

/* ---------------- Overview ---------------- */

export interface OverviewStats {
  totalInboxesCreated: number;
  activeInboxes: number;
  totalEmailsReceived: number;
  emailsRejected: number;
  jobsCompleted: number;
  jobsPending: number;
  jobsFailed: number;
  webhookFailures24h: number;
  apiRequestsToday: number;
  apiRequests7d: number;
  storage: { databaseBytes: number; messageBytes: number; attachmentBytes: number };
  series: { day: string; inboxes: number; messages: number; api: number }[];
  domainsReceiving: number;
  domainsTotal: number;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const db = getDb();
  const since = utcDay(new Date(Date.now() - 13 * DAY));

  const [totals] = await db
    .select({
      inboxes: sql<number>`coalesce(sum(${dailyStats.inboxesCreated}), 0)::int`,
      messages: sql<number>`coalesce(sum(${dailyStats.messagesReceived}), 0)::int`,
      rejected: sql<number>`coalesce(sum(${dailyStats.messagesRejected}), 0)::int`,
    })
    .from(dailyStats);

  const [{ active } = { active: 0 }] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(inboxes)
    .where(gt(inboxes.expiresAt, new Date()));

  const jobCounts = await db
    .select({ status: ingestJobs.status, total: sql<number>`count(*)::int` })
    .from(ingestJobs)
    .groupBy(ingestJobs.status);
  const jobsBy = (status: string) => jobCounts.find((row) => row.status === status)?.total ?? 0;

  const [{ failures } = { failures: 0 }] = await db
    .select({ failures: sql<number>`count(*)::int` })
    .from(webhookFailures)
    .where(gt(webhookFailures.createdAt, new Date(Date.now() - DAY)));

  const seriesRows = await db
    .select()
    .from(dailyStats)
    .where(gte(dailyStats.day, since))
    .orderBy(asc(dailyStats.day));
  const series: OverviewStats["series"] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const day = utcDay(new Date(Date.now() - i * DAY));
    const row = seriesRows.find((entry) => entry.day === day);
    series.push({
      day,
      inboxes: row?.inboxesCreated ?? 0,
      messages: row?.messagesReceived ?? 0,
      api: row?.apiRequests ?? 0,
    });
  }

  const storage = await db.execute<{
    database_bytes: string;
    message_bytes: string;
    attachment_bytes: string;
  }>(sql`
    select pg_database_size(current_database())::text as database_bytes,
           (select coalesce(sum(size_bytes), 0) from messages)::text as message_bytes,
           (select coalesce(sum(size_bytes), 0) from attachments where content is not null)::text as attachment_bytes
  `);
  const storageRow = storage.rows[0]!;

  const domainRows = await db.select().from(domains);
  const { isDomainReceiving } = await import("@/server/domains/service");

  return {
    totalInboxesCreated: totals?.inboxes ?? 0,
    activeInboxes: active,
    totalEmailsReceived: totals?.messages ?? 0,
    emailsRejected: totals?.rejected ?? 0,
    jobsCompleted: jobsBy("completed"),
    jobsPending: jobsBy("pending") + jobsBy("processing"),
    jobsFailed: jobsBy("failed"),
    webhookFailures24h: failures,
    apiRequestsToday: series.at(-1)?.api ?? 0,
    apiRequests7d: series.slice(-7).reduce((sum, day) => sum + day.api, 0),
    storage: {
      databaseBytes: Number(storageRow.database_bytes),
      messageBytes: Number(storageRow.message_bytes),
      attachmentBytes: Number(storageRow.attachment_bytes),
    },
    series,
    domainsReceiving: domainRows.filter(isDomainReceiving).length,
    domainsTotal: domainRows.length,
  };
}

/* ---------------- Inboxes ---------------- */

export interface AdminInboxRow {
  id: string;
  publicId: string;
  address: string;
  createdAt: Date;
  expiresAt: Date;
  messageCount: number;
  plan: string;
  ownerEmail: string | null;
  createdIpHash: string | null;
  blocked: boolean;
  expired: boolean;
}

export async function searchInboxes(options: {
  query?: string;
  status: "active" | "expired" | "all";
  page: number;
  pageSize?: number;
}): Promise<{ rows: AdminInboxRow[]; total: number }> {
  const db = getDb();
  const pageSize = options.pageSize ?? 25;
  const conditions: SQL[] = [];
  if (options.query) {
    const pattern = `%${options.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      or(
        ilike(inboxes.address, pattern),
        ilike(inboxes.publicId, pattern),
        ilike(users.email, pattern),
      )!,
    );
  }
  if (options.status === "active") conditions.push(gt(inboxes.expiresAt, new Date()));
  if (options.status === "expired") conditions.push(lte(inboxes.expiresAt, new Date()));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: inboxes.id,
      publicId: inboxes.publicId,
      address: inboxes.address,
      createdAt: inboxes.createdAt,
      expiresAt: inboxes.expiresAt,
      messageCount: inboxes.messageCount,
      plan: inboxes.plan,
      ownerEmail: users.email,
      createdIpHash: inboxes.createdIpHash,
      blocked: sql<boolean>`exists (select 1 from ip_blocks b where b.ip_hash = ${inboxes.createdIpHash} and (b.expires_at is null or b.expires_at > now()))`,
      expired: sql<boolean>`${inboxes.expiresAt} <= now()`,
    })
    .from(inboxes)
    .leftJoin(users, eq(users.id, inboxes.userId))
    .where(where)
    .orderBy(desc(inboxes.createdAt))
    .limit(pageSize)
    .offset(Math.max(0, options.page - 1) * pageSize);

  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(inboxes)
    .leftJoin(users, eq(users.id, inboxes.userId))
    .where(where);
  return { rows, total };
}

export async function adminDeleteInbox(inboxId: string, actor: AuditActor): Promise<void> {
  const [row] = await getDb()
    .select({ address: inboxes.address })
    .from(inboxes)
    .where(eq(inboxes.id, inboxId))
    .limit(1);
  if (!row) throw errors.notFound("Inbox not found.");
  await deleteInboxById(inboxId, "deleted");
  await writeAudit(actor, "inbox.deleted_by_admin", { type: "inbox", id: row.address });
}

/* ---------------- IP blocks ---------------- */

export async function listIpBlocks() {
  return getDb()
    .select({
      id: ipBlocks.id,
      label: ipBlocks.label,
      reason: ipBlocks.reason,
      ipHash: ipBlocks.ipHash,
      createdAt: ipBlocks.createdAt,
      expiresAt: ipBlocks.expiresAt,
      createdBy: users.email,
    })
    .from(ipBlocks)
    .leftJoin(users, eq(users.id, ipBlocks.createdBy))
    .where(or(isNull(ipBlocks.expiresAt), gt(ipBlocks.expiresAt, new Date())))
    .orderBy(desc(ipBlocks.createdAt));
}

/**
 * Block a client network. Raw IPs are hashed immediately and never stored;
 * blocks can also target the hashed creator IP of an existing inbox.
 */
export async function blockNetwork(
  input: { ip?: string; ipHash?: string; label?: string; reason: string; hours: number | null },
  actor: AuditActor,
): Promise<void> {
  let ipHash = input.ipHash;
  let label = input.label ?? "Network of an inbox creator";
  if (input.ip) {
    const ip = normalizeIp(input.ip);
    if (!ip) throw errors.badRequest("Enter a valid IPv4 or IPv6 address.");
    ipHash = hashIp(ip);
    label = maskIp(ip);
  }
  if (!ipHash || !/^[0-9a-f]{32}$/.test(ipHash)) throw errors.badRequest("Nothing to block.");
  const reason = input.reason.trim().slice(0, 300) || "Abuse";
  const expiresAt = input.hours ? new Date(Date.now() + input.hours * 3_600_000) : null;
  await getDb()
    .insert(ipBlocks)
    .values({ ipHash, label, reason, createdBy: actor.userId, expiresAt })
    .onConflictDoUpdate({
      target: ipBlocks.ipHash,
      set: { reason, expiresAt, createdBy: actor.userId, label },
    });
  await writeAudit(actor, "ip.blocked", { type: "ip", id: label }, { reason, hours: input.hours });
}

export async function unblockNetwork(id: string, actor: AuditActor): Promise<void> {
  const [row] = await getDb()
    .delete(ipBlocks)
    .where(eq(ipBlocks.id, id))
    .returning({ label: ipBlocks.label });
  if (!row) throw errors.notFound("Block not found.");
  await writeAudit(actor, "ip.unblocked", { type: "ip", id: row.label });
}

/* ---------------- Processing ---------------- */

export async function listWebhookFailures(limit = 50) {
  return getDb()
    .select()
    .from(webhookFailures)
    .orderBy(desc(webhookFailures.createdAt))
    .limit(limit);
}

export async function webhookFailureSummary() {
  return getDb()
    .select({
      provider: webhookFailures.provider,
      reason: webhookFailures.reason,
      total: sql<number>`count(*)::int`,
    })
    .from(webhookFailures)
    .where(gt(webhookFailures.createdAt, new Date(Date.now() - 7 * DAY)))
    .groupBy(webhookFailures.provider, webhookFailures.reason)
    .orderBy(desc(sql`count(*)`));
}

/* ---------------- Users ---------------- */

export async function listUsers(query?: string) {
  const db = getDb();
  const where = query
    ? ilike(users.email, `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    : undefined;
  return db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      plan: users.plan,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      inboxCount: sql<number>`(select count(*)::int from inboxes i where i.user_id = ${users.id} and i.expires_at > now())`,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(200);
}

/* ---------------- Audit & contact ---------------- */

export async function listAuditLogs(options: { action?: string; limit?: number } = {}) {
  return getDb()
    .select()
    .from(auditLogs)
    .where(
      options.action
        ? ilike(auditLogs.action, `${options.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
        : undefined,
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(options.limit ?? 100);
}

export async function listContactRequests(status: "open" | "closed" | "all" = "open") {
  return getDb()
    .select()
    .from(contactRequests)
    .where(status === "all" ? undefined : eq(contactRequests.status, status))
    .orderBy(desc(contactRequests.createdAt))
    .limit(200);
}

export async function setContactRequestStatus(
  id: string,
  status: "open" | "closed",
  actor: AuditActor,
): Promise<void> {
  const [row] = await getDb()
    .update(contactRequests)
    .set({ status })
    .where(eq(contactRequests.id, id))
    .returning({ id: contactRequests.id });
  if (!row) throw errors.notFound("Message not found.");
  await writeAudit(actor, `contact.${status}`, { type: "contact_request", id });
}
