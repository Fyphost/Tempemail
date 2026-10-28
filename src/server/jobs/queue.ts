import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { writeAudit, type AuditActor } from "@/server/audit";
import { getDb } from "@/server/db/client";
import {
  ingestJobs,
  webhookFailures,
  type IngestJob,
  type IngestProvider,
  type IngestResult,
  type IngestStatus,
} from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { notifyJobQueued } from "@/server/realtime/events";
import { sha256Hex } from "@/server/security/crypto";
import { incrementStat } from "@/server/stats";

export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export interface EnqueueInput {
  provider: IngestProvider;
  raw: Buffer;
  recipients: string[];
  envelopeFrom?: string | null;
  remoteIpHash?: string | null;
}

/**
 * Durably record an inbound message. Identical payloads for the same
 * recipients (webhook retries, duplicate SMTP deliveries) collapse into one job.
 */
export async function enqueueIngestJob(
  input: EnqueueInput,
): Promise<{ jobId: string; duplicate: boolean }> {
  const recipients = [...new Set(input.recipients)].sort();
  const dedupeKey = `${sha256Hex(input.raw)}:${sha256Hex(recipients.join(","))}`;
  const db = getDb();
  const [row] = await db
    .insert(ingestJobs)
    .values({
      provider: input.provider,
      dedupeKey,
      recipients,
      envelopeFrom: input.envelopeFrom?.slice(0, 320) ?? null,
      raw: input.raw,
      rawSize: input.raw.length,
      remoteIpHash: input.remoteIpHash ?? null,
    })
    .onConflictDoNothing({ target: ingestJobs.dedupeKey })
    .returning({ id: ingestJobs.id });
  if (!row) {
    const [existing] = await db
      .select({ id: ingestJobs.id })
      .from(ingestJobs)
      .where(eq(ingestJobs.dedupeKey, dedupeKey))
      .limit(1);
    return { jobId: existing?.id ?? "", duplicate: true };
  }
  await notifyJobQueued(row.id);
  return { jobId: row.id, duplicate: false };
}

/** Atomically claim the next runnable job; safe with many concurrent workers. */
export async function claimIngestJob(): Promise<IngestJob | null> {
  const db = getDb();
  const [job] = await db
    .update(ingestJobs)
    .set({
      status: "processing",
      lockedAt: new Date(),
      attempts: sql`${ingestJobs.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      sql`${ingestJobs.id} = (
        select j.id from ingest_jobs j
        where j.status = 'pending' and j.run_at <= now()
        order by j.run_at asc
        limit 1
        for update skip locked
      )`,
    )
    .returning();
  return job ?? null;
}

export async function completeIngestJob(
  jobId: string,
  status: Extract<IngestStatus, "completed" | "rejected">,
  result: IngestResult,
): Promise<void> {
  await getDb()
    .update(ingestJobs)
    .set({
      status,
      result,
      raw: null,
      lastError: status === "rejected" ? summarizeRejections(result) : null,
      lockedAt: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ingestJobs.id, jobId));
}

function summarizeRejections(result: IngestResult): string | null {
  const reasons = (result.rejected ?? []).map((entry) => entry.reason);
  return reasons.length > 0 ? [...new Set(reasons)].join(", ") : null;
}

export function retryDelayMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
}

export async function failIngestJob(job: IngestJob, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  const permanent = error instanceof PermanentJobError || job.attempts >= job.maxAttempts;
  await getDb()
    .update(ingestJobs)
    .set(
      permanent
        ? { status: "failed", lastError: message, lockedAt: null, updatedAt: new Date() }
        : {
            status: "pending",
            lastError: message,
            lockedAt: null,
            runAt: new Date(Date.now() + retryDelayMs(job.attempts)),
            updatedAt: new Date(),
          },
    )
    .where(eq(ingestJobs.id, job.id));
  if (permanent) {
    await incrementStat("ingestFailed").catch(() => undefined);
    logger.error("Ingest job failed permanently", { jobId: job.id, error: message });
  } else {
    logger.warn("Ingest job failed; will retry", {
      jobId: job.id,
      attempt: job.attempts,
      error: message,
    });
  }
}

/** Jobs left in "processing" by a crashed worker become runnable again. */
export async function recoverStaleJobs(staleAfterMs = 5 * 60_000): Promise<number> {
  const result = await getDb()
    .update(ingestJobs)
    .set({ status: "pending", lockedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(ingestJobs.status, "processing"),
        lt(ingestJobs.lockedAt, new Date(Date.now() - staleAfterMs)),
      ),
    );
  return result.rowCount ?? 0;
}

export async function retryIngestJob(jobId: string, actor: AuditActor): Promise<void> {
  const db = getDb();
  const [job] = await db
    .update(ingestJobs)
    .set({
      status: "pending",
      attempts: 0,
      runAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ingestJobs.id, jobId),
        inArray(ingestJobs.status, ["failed"]),
        sql`${ingestJobs.raw} is not null`,
      ),
    )
    .returning({ id: ingestJobs.id });
  if (!job)
    throw errors.conflict(
      "Only failed jobs that still have their payload can be retried.",
      "not_retryable",
    );
  await notifyJobQueued(job.id);
  await writeAudit(actor, "ingest_job.retried", { type: "ingest_job", id: jobId });
}

export async function recordWebhookFailure(
  provider: string,
  reason: string,
  statusCode: number,
  ipHash: string | null,
): Promise<void> {
  try {
    await getDb()
      .insert(webhookFailures)
      .values({ provider, reason: reason.slice(0, 300), statusCode, ipHash });
  } catch (error) {
    logger.warn("Could not record webhook failure", { error });
  }
}

export async function listRecentJobs(options: { status?: IngestStatus; limit: number }) {
  const db = getDb();
  return db
    .select({
      id: ingestJobs.id,
      provider: ingestJobs.provider,
      status: ingestJobs.status,
      recipients: ingestJobs.recipients,
      rawSize: ingestJobs.rawSize,
      attempts: ingestJobs.attempts,
      maxAttempts: ingestJobs.maxAttempts,
      lastError: ingestJobs.lastError,
      result: ingestJobs.result,
      hasPayload: sql<boolean>`${ingestJobs.raw} is not null`,
      createdAt: ingestJobs.createdAt,
      completedAt: ingestJobs.completedAt,
      runAt: ingestJobs.runAt,
    })
    .from(ingestJobs)
    .where(options.status ? eq(ingestJobs.status, options.status) : undefined)
    .orderBy(desc(ingestJobs.createdAt))
    .limit(options.limit);
}
