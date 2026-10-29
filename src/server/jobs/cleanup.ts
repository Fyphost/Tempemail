import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { deleteExpiredSessions } from "@/server/auth/users";
import { getDb, getPool } from "@/server/db/client";
import {
  auditLogs,
  contactRequests,
  domains,
  ingestJobs,
  ipBlocks,
  rateLimits,
  webhookFailures,
  webhookNonces,
} from "@/server/db/schema";
import { checkDomainDns } from "@/server/domains/service";
import { logger } from "@/server/logger";
import { EVENTS_CHANNEL } from "@/server/realtime/events";
import { getSettings } from "@/server/settings";

import { deleteStaleHeartbeats } from "./heartbeat";
import { recoverStaleJobs } from "./queue";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface CleanupReport {
  expiredInboxes: number;
  jobsPurged: number;
  failedJobsPurged: number;
  staleJobsRecovered: number;
  rateLimitRows: number;
  sessions: number;
  auditLogs: number;
  webhookFailures: number;
  ipBlocks: number;
  contactRequests: number;
}

/**
 * Delete expired inboxes in batches. Messages, attachments and tokens are
 * removed by ON DELETE CASCADE. Connected clients are notified in the same
 * transaction so they see the expiry immediately.
 */
export async function deleteExpiredInboxes(batchSize = 200): Promise<number> {
  const pool = getPool();
  let total = 0;
  for (;;) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<{ id: string }>(
        `delete from inboxes where id in (
           select id from inboxes where expires_at <= now()
           order by expires_at asc limit $1 for update skip locked
         ) returning id`,
        [batchSize],
      );
      for (const row of rows) {
        await client.query("select pg_notify($1, $2)", [
          EVENTS_CHANNEL,
          JSON.stringify({ inbox: row.id, event: { type: "inbox.deleted", reason: "expired" } }),
        ]);
      }
      await client.query("commit");
      total += rows.length;
      if (rows.length < batchSize) break;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  return total;
}

export async function runCleanup(): Promise<CleanupReport> {
  const settings = await getSettings();
  const db = getDb();
  const now = Date.now();
  const count = (result: { rowCount: number | null }) => result.rowCount ?? 0;

  const expiredInboxes = await deleteExpiredInboxes();
  const staleJobsRecovered = await recoverStaleJobs();

  const jobsPurged = count(
    await db
      .delete(ingestJobs)
      .where(
        and(
          inArray(ingestJobs.status, ["completed", "rejected"]),
          lt(ingestJobs.createdAt, new Date(now - settings.retention.completedJobsHours * HOUR)),
        ),
      ),
  );
  const failedJobsPurged = count(
    await db
      .delete(ingestJobs)
      .where(
        and(
          eq(ingestJobs.status, "failed"),
          lt(ingestJobs.createdAt, new Date(now - settings.retention.failedJobsDays * DAY)),
        ),
      ),
  );
  const rateLimitRows = count(
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now - DAY))),
  );
  await db.delete(webhookNonces).where(lt(webhookNonces.createdAt, new Date(now - 2 * DAY)));
  const sessions = await deleteExpiredSessions();
  const audit = count(
    await db
      .delete(auditLogs)
      .where(lt(auditLogs.createdAt, new Date(now - settings.retention.auditLogDays * DAY))),
  );
  const failures = count(
    await db
      .delete(webhookFailures)
      .where(
        lt(webhookFailures.createdAt, new Date(now - settings.retention.webhookFailureDays * DAY)),
      ),
  );
  const blocks = count(
    await db
      .delete(ipBlocks)
      .where(and(isNotNull(ipBlocks.expiresAt), lt(ipBlocks.expiresAt, new Date(now)))),
  );
  const contact = count(
    await db
      .delete(contactRequests)
      .where(
        lt(contactRequests.createdAt, new Date(now - settings.retention.contactRequestsDays * DAY)),
      ),
  );
  await deleteStaleHeartbeats();

  return {
    expiredInboxes,
    jobsPurged,
    failedJobsPurged,
    staleJobsRecovered,
    rateLimitRows,
    sessions,
    auditLogs: audit,
    webhookFailures: failures,
    ipBlocks: blocks,
    contactRequests: contact,
  };
}

/** Periodic MX re-verification for every domain that is enabled or awaiting setup. */
export async function recheckDomains(maxAgeMs = 30 * 60_000): Promise<number> {
  const db = getDb();
  const due = await db
    .select({ id: domains.id })
    .from(domains)
    .where(
      or(
        sql`${domains.mxCheckedAt} is null`,
        lt(domains.mxCheckedAt, new Date(Date.now() - maxAgeMs)),
      ),
    );
  for (const domain of due) {
    try {
      await checkDomainDns(domain.id);
    } catch (error) {
      logger.warn("Scheduled DNS check failed", { error });
    }
  }
  return due.length;
}

/**
 * Run `task` only if no other worker holds the same advisory lock, so
 * scheduled jobs execute once even with several worker replicas.
 */
export async function withAdvisoryLock<T>(
  lockId: number,
  task: () => Promise<T>,
): Promise<T | null> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) as locked",
      [lockId],
    );
    if (!rows[0]?.locked) return null;
    try {
      return await task();
    } finally {
      await client.query("select pg_advisory_unlock($1)", [lockId]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

export const LOCKS = { cleanup: 734_001, dns: 734_002 } as const;
