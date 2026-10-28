import { and, gt, isNull, or, sql, eq } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { ipBlocks, rateLimits } from "@/server/db/schema";
import { errors } from "@/server/http/errors";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

function windowStartFor(now: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * Shared fixed-window limiter stored in PostgreSQL, so limits hold across
 * multiple web and worker instances. Used for security-sensitive actions.
 */
export async function consumeRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
  cost = 1,
): Promise<RateLimitResult> {
  const now = Date.now();
  const start = windowStartFor(now, windowSeconds);
  const db = getDb();
  const [row] = await db
    .insert(rateLimits)
    .values({ key: `${scope}:${subject}`, windowStart: new Date(start), count: cost })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + ${cost}` },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? cost;
  const retryAfterSeconds = Math.max(1, Math.ceil((start + windowSeconds * 1000 - now) / 1000));
  return {
    allowed: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  };
}

export async function enforceRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
  message?: string,
): Promise<RateLimitResult> {
  const result = await consumeRateLimit(scope, subject, limit, windowSeconds);
  if (!result.allowed) throw errors.rateLimited(result.retryAfterSeconds, message);
  return result;
}

/**
 * In-process limiter for the general per-IP request budget. It avoids a
 * database write on every request; in multi-instance deployments the budget
 * applies per instance (put a shared limit in the reverse proxy if needed).
 */
const memoryGlobals = globalThis as typeof globalThis & {
  __tempemailMemoryLimiter?: {
    buckets: Map<string, { start: number; count: number }>;
    sweptAt: number;
  };
};

export function consumeMemoryRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  memoryGlobals.__tempemailMemoryLimiter ??= { buckets: new Map(), sweptAt: Date.now() };
  const state = memoryGlobals.__tempemailMemoryLimiter;
  const now = Date.now();
  const start = windowStartFor(now, windowSeconds);

  if (now - state.sweptAt > 60_000) {
    for (const [bucketKey, bucket] of state.buckets) {
      if (bucket.start < start) state.buckets.delete(bucketKey);
    }
    state.sweptAt = now;
  }

  const bucket = state.buckets.get(key);
  const next =
    bucket && bucket.start === start ? { start, count: bucket.count + 1 } : { start, count: 1 };
  state.buckets.set(key, next);
  return {
    allowed: next.count <= limit,
    count: next.count,
    limit,
    remaining: Math.max(0, limit - next.count),
    retryAfterSeconds: Math.max(1, Math.ceil((start + windowSeconds * 1000 - now) / 1000)),
  };
}

export async function isIpBlocked(ipHash: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: ipBlocks.id })
    .from(ipBlocks)
    .where(
      and(
        eq(ipBlocks.ipHash, ipHash),
        or(isNull(ipBlocks.expiresAt), gt(ipBlocks.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function assertIpNotBlocked(ipHash: string): Promise<void> {
  if (await isIpBlocked(ipHash)) {
    throw errors.forbidden(
      "Requests from your network are temporarily blocked because of abuse. Contact support if you think this is a mistake.",
    );
  }
}
