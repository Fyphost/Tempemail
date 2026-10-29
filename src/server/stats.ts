import { sql } from "drizzle-orm";

import { getDb, type DbOrTx } from "@/server/db/client";
import { dailyStats } from "@/server/db/schema";
import { logger } from "@/server/logger";

type Counter =
  "inboxesCreated" | "messagesReceived" | "messagesRejected" | "ingestFailed" | "apiRequests";

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function incrementStat(
  counter: Counter,
  amount = 1,
  db: DbOrTx = getDb(),
): Promise<void> {
  if (amount <= 0) return;
  const column = dailyStats[counter];
  await db
    .insert(dailyStats)
    .values({ day: utcDay(), [counter]: amount })
    .onConflictDoUpdate({
      target: dailyStats.day,
      set: { [counter]: sql`${column} + ${amount}` },
    });
}

/**
 * API request volume is buffered in memory and flushed periodically so the
 * metric never adds a write to every request.
 */
const globals = globalThis as typeof globalThis & {
  __tempemailApiCounter?: { pending: number; timer?: NodeJS.Timeout };
};

export function countApiRequest(): void {
  globals.__tempemailApiCounter ??= { pending: 0 };
  const state = globals.__tempemailApiCounter;
  state.pending += 1;
  if (!state.timer) {
    state.timer = setTimeout(() => {
      void flushApiRequestCount();
    }, 15_000);
    state.timer.unref?.();
  }
}

export async function flushApiRequestCount(): Promise<void> {
  const state = globals.__tempemailApiCounter;
  if (!state) return;
  const amount = state.pending;
  state.pending = 0;
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
  if (amount === 0) return;
  try {
    await incrementStat("apiRequests", amount);
  } catch (error) {
    state.pending += amount;
    logger.warn("Failed to flush API request counter", { error });
  }
}
