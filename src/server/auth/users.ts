import { and, eq, gt, lt, sql } from "drizzle-orm";

import { writeAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/audit";
import { getDb } from "@/server/db/client";
import {
  users,
  userSessions,
  type PlanId,
  type User,
  type UserRole,
  type UserStatus,
} from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { errors } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { secrets, sha256Hex } from "@/server/security/crypto";
import { dummyPasswordHash, hashPassword, verifyPassword } from "@/server/security/password";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertPasswordStrength(password: string): void {
  if (password.length < 10) throw errors.badRequest("Use a password with at least 10 characters.");
  if (password.length > 200) throw errors.badRequest("Passwords can be at most 200 characters.");
}

export async function createUser(
  input: { email: string; password: string; role?: UserRole; plan?: PlanId },
  actor: AuditActor,
): Promise<User> {
  const email = normalizeEmail(input.email);
  assertPasswordStrength(input.password);
  const db = getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw errors.conflict("An account with this email already exists.", "email_taken");
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role ?? "user",
      plan: input.plan ?? "free",
    })
    .returning();
  await writeAudit(
    actor,
    "user.created",
    { type: "user", id: user!.id },
    { email, role: user!.role },
  );
  return user!;
}

/** Verifies credentials with uniform timing whether or not the account exists. */
export async function authenticateUser(emailInput: string, password: string): Promise<User | null> {
  const email = normalizeEmail(emailInput);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    await verifyPassword(password, await dummyPasswordHash());
    return null;
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid || user.status !== "active") return null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return user;
}

export async function createUserSession(
  userId: string,
  meta: { ipHash?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = secrets.userSession();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getDb()
    .insert(userSessions)
    .values({
      userId,
      tokenHash: sha256Hex(token),
      expiresAt,
      ipHash: meta.ipHash ?? null,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
    });
  return { token, expiresAt };
}

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  plan: PlanId;
  status: UserStatus;
  sessionId: string;
}

export async function getUserBySessionToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const db = getDb();
  const [row] = await db
    .select({
      sessionId: userSessions.id,
      lastSeenAt: userSessions.lastSeenAt,
      id: users.id,
      email: users.email,
      role: users.role,
      plan: users.plan,
      status: users.status,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(
      and(eq(userSessions.tokenHash, sha256Hex(token)), gt(userSessions.expiresAt, new Date())),
    )
    .limit(1);
  if (!row || row.status !== "active") return null;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(userSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(userSessions.id, row.sessionId));
  }
  const { lastSeenAt: _ignored, ...user } = row;
  return user;
}

export async function revokeUserSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await getDb()
    .delete(userSessions)
    .where(eq(userSessions.tokenHash, sha256Hex(token)));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await getDb().delete(userSessions).where(eq(userSessions.userId, userId));
}

export async function deleteExpiredSessions(): Promise<number> {
  const result = await getDb().delete(userSessions).where(lt(userSessions.expiresAt, new Date()));
  return result.rowCount ?? 0;
}

export async function updateUserByAdmin(
  userId: string,
  patch: { role?: UserRole; plan?: PlanId; status?: UserStatus },
  actor: AuditActor,
): Promise<User> {
  if (actor.userId === userId && (patch.role === "user" || patch.status === "disabled")) {
    throw errors.badRequest("You cannot remove your own administrator access.");
  }
  const db = getDb();
  const [user] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!user) throw errors.notFound("User not found.");
  if (patch.status === "disabled") await revokeAllUserSessions(userId);
  await writeAudit(
    actor,
    "user.updated",
    { type: "user", id: userId },
    { ...patch, email: user.email },
  );
  return user;
}

/** Administrator-initiated password reset (there is no email-based reset). Signs the user out everywhere. */
export async function setPasswordByAdmin(
  userId: string,
  password: string,
  actor: AuditActor,
): Promise<void> {
  assertPasswordStrength(password);
  const db = getDb();
  const [user] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ email: users.email });
  if (!user) throw errors.notFound("User not found.");
  await revokeAllUserSessions(userId);
  await writeAudit(
    actor,
    "user.password_reset",
    { type: "user", id: userId },
    { email: user.email },
  );
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    throw errors.badRequest("Your current password is incorrect.");
  }
  assertPasswordStrength(next);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), updatedAt: new Date() })
    .where(eq(users.id, userId));
  await writeAudit({ userId, label: user.email }, "user.password_changed", {
    type: "user",
    id: userId,
  });
}

/**
 * Create the first administrator from ADMIN_BOOTSTRAP_EMAIL/PASSWORD when no
 * administrator exists yet. Safe to call on every worker start.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const env = getEnv();
  if (!env.ADMIN_BOOTSTRAP_EMAIL || !env.ADMIN_BOOTSTRAP_PASSWORD) return;
  const db = getDb();
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "admin"));
  if (count > 0) return;
  const email = normalizeEmail(env.ADMIN_BOOTSTRAP_EMAIL);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db
      .update(users)
      .set({ role: "admin", status: "active" })
      .where(eq(users.id, existing.id));
    logger.info("Promoted bootstrap administrator", { email });
    return;
  }
  await createUser({ email, password: env.ADMIN_BOOTSTRAP_PASSWORD, role: "admin" }, SYSTEM_ACTOR);
  logger.info("Created bootstrap administrator", { email });
}
