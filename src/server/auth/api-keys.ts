import { and, desc, eq, isNull } from "drizzle-orm";

import { writeAudit } from "@/server/audit";
import { getDb } from "@/server/db/client";
import { apiKeys, users } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import { publicIds, secrets, sha256Hex } from "@/server/security/crypto";
import { getSettings, limitsFor } from "@/server/settings";

import type { SessionUser } from "./users";

const MAX_KEYS_PER_USER = 10;

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function assertApiKeysAllowed(user: Pick<SessionUser, "plan">): Promise<void> {
  const settings = await getSettings();
  if (!settings.api.enabled || !settings.api.keysEnabled) {
    throw errors.forbidden("API keys are not available on this service.");
  }
  if (!limitsFor(user.plan, settings).apiKeys) {
    throw errors.forbidden("API keys are not included in your plan.");
  }
}

export async function listApiKeys(userId: string): Promise<ApiKeyView[]> {
  const rows = await getDb()
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map((row) => ({
    id: row.publicId,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }));
}

export async function createApiKey(
  user: SessionUser,
  name: string,
): Promise<{ key: string; view: ApiKeyView }> {
  await assertApiKeysAllowed(user);
  const db = getDb();
  const active = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_KEYS_PER_USER) {
    throw errors.conflict(
      `You can have at most ${MAX_KEYS_PER_USER} active API keys.`,
      "key_limit",
    );
  }
  const key = secrets.apiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      publicId: publicIds.apiKey(),
      userId: user.id,
      name: name.trim().slice(0, 80) || "API key",
      prefix: key.slice(0, 12),
      keyHash: sha256Hex(key),
    })
    .returning();
  await writeAudit({ userId: user.id, label: user.email }, "api_key.created", {
    type: "api_key",
    id: row!.publicId,
  });
  return {
    key,
    view: {
      id: row!.publicId,
      name: row!.name,
      prefix: row!.prefix,
      createdAt: row!.createdAt.toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    },
  };
}

export async function revokeApiKey(user: SessionUser, publicId: string): Promise<void> {
  const [row] = await getDb()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(apiKeys.publicId, publicId), eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)),
    )
    .returning({ id: apiKeys.id });
  if (!row) throw errors.notFound("API key not found.");
  await writeAudit({ userId: user.id, label: user.email }, "api_key.revoked", {
    type: "api_key",
    id: publicId,
  });
}

export interface ApiKeyPrincipal {
  user: SessionUser;
  keyId: string;
}

/** Resolve a `tek_` bearer key to its (active) owner. */
export async function authenticateApiKey(key: string): Promise<ApiKeyPrincipal> {
  const db = getDb();
  const [row] = await db
    .select({
      keyId: apiKeys.id,
      lastUsedAt: apiKeys.lastUsedAt,
      id: users.id,
      email: users.email,
      role: users.role,
      plan: users.plan,
      status: users.status,
    })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.keyHash, sha256Hex(key)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row || row.status !== "active") throw errors.unauthorized("Invalid or revoked API key.");
  const user: SessionUser = {
    id: row.id,
    email: row.email,
    role: row.role,
    plan: row.plan,
    status: row.status,
    sessionId: `key:${row.keyId}`,
  };
  await assertApiKeysAllowed(user);
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.keyId));
  }
  return { user, keyId: row.keyId };
}
