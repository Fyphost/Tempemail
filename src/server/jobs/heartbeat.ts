import os from "node:os";

import { eq, lt } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { workerHeartbeats } from "@/server/db/schema";
import { logger } from "@/server/logger";

export const HEARTBEAT_INTERVAL_MS = 30_000;
/** A worker is considered online if it reported within this window. */
export const HEARTBEAT_STALE_MS = 90_000;

export interface HeartbeatState {
  smtpListening: boolean;
  smtpPort: number | null;
  smtpTls: boolean;
}

/** Periodically records that this worker is alive and what it is serving. */
export function startHeartbeat(state: () => HeartbeatState): { stop: () => Promise<void> } {
  const id = `${os.hostname()}:${process.pid}`;
  const startedAt = new Date();
  const beat = async () => {
    const current = state();
    const values = { ...current, lastSeenAt: new Date() };
    await getDb()
      .insert(workerHeartbeats)
      .values({ id, startedAt, ...values })
      .onConflictDoUpdate({ target: workerHeartbeats.id, set: values });
  };
  const run = () => {
    beat().catch((error: unknown) => logger.warn("Worker heartbeat failed", { error }));
  };
  run();
  const timer = setInterval(run, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return {
    stop: async () => {
      clearInterval(timer);
      await getDb()
        .delete(workerHeartbeats)
        .where(eq(workerHeartbeats.id, id))
        .catch(() => undefined);
    },
  };
}

export async function deleteStaleHeartbeats(maxAgeMs = 24 * 3_600_000): Promise<void> {
  await getDb()
    .delete(workerHeartbeats)
    .where(lt(workerHeartbeats.lastSeenAt, new Date(Date.now() - maxAgeMs)));
}
