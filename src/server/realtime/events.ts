import { sql } from "drizzle-orm";

import { getDb, type DbOrTx } from "@/server/db/client";

export const EVENTS_CHANNEL = "tempemail_events";
export const JOBS_CHANNEL = "tempemail_jobs";

export type InboxEvent =
  | { type: "message.received"; messageId: string }
  | { type: "message.deleted"; messageId: string }
  | { type: "inbox.updated"; expiresAt: string }
  | { type: "inbox.deleted"; reason: "deleted" | "expired" };

export interface BusEnvelope {
  inbox: string;
  event: InboxEvent;
}

/**
 * Publish an inbox event. When called inside a transaction, PostgreSQL only
 * delivers the notification if the transaction commits.
 */
export async function publishInboxEvent(
  inboxInternalId: string,
  event: InboxEvent,
  db: DbOrTx = getDb(),
): Promise<void> {
  const payload: BusEnvelope = { inbox: inboxInternalId, event };
  await db.execute(sql`select pg_notify(${EVENTS_CHANNEL}, ${JSON.stringify(payload)})`);
}

export async function notifyJobQueued(jobId: string, db: DbOrTx = getDb()): Promise<void> {
  await db.execute(sql`select pg_notify(${JOBS_CHANNEL}, ${jobId})`);
}
