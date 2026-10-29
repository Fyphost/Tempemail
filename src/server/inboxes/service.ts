import { and, desc, eq, gt, sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import {
  domains,
  inboxes,
  inboxTokens,
  type Domain,
  type Inbox,
  type PlanId,
} from "@/server/db/schema";
import { allocateLocalPart, findDomainByName, getAvailableDomains } from "@/server/domains/service";
import { errors, ApiError } from "@/server/http/errors";
import { publishInboxEvent } from "@/server/realtime/events";
import { publicIds, secrets, sha256Hex } from "@/server/security/crypto";
import { assertIpNotBlocked, enforceRateLimit } from "@/server/security/rate-limit";
import { effectivePlan, getSettings, limitsFor, type PlanLimits } from "@/server/settings";
import { incrementStat } from "@/server/stats";
import type { InboxView } from "@/lib/types";

export type { InboxView };

const MINUTE = 60_000;

export interface InboxPrincipal {
  userId: string | null;
  plan: PlanId;
}

export interface InboxWithDomain {
  inbox: Inbox;
  domain: Domain;
}

export function serializeInbox(inbox: Inbox, domain: Domain, limits: PlanLimits): InboxView {
  const extendable =
    limits.extendMinutes > 0 && inbox.expiresAt.getTime() < inbox.maxExpiresAt.getTime() - MINUTE;
  return {
    id: inbox.publicId,
    address: inbox.address,
    domain: domain.name,
    createdAt: inbox.createdAt.toISOString(),
    expiresAt: inbox.expiresAt.toISOString(),
    maxExpiresAt: inbox.maxExpiresAt.toISOString(),
    messageCount: inbox.messageCount,
    plan: inbox.plan,
    owned: inbox.userId !== null,
    limits: {
      maxMessages: limits.maxMessagesPerInbox,
      maxMessageSizeKb: limits.maxMessageSizeKb,
      extendMinutes: limits.extendMinutes,
      canExtend: extendable,
    },
  };
}

export async function inboxLimits(inbox: Pick<Inbox, "plan">): Promise<PlanLimits> {
  return limitsFor(inbox.plan, await getSettings());
}

export interface CreateInboxInput {
  principal: InboxPrincipal;
  ipHash: string;
  domain?: string;
  ttlMinutes?: number;
  /** Inbox to delete once the new one exists (anonymous "new address"). */
  replaceInboxId?: string | null;
}

export interface CreatedInbox extends InboxWithDomain {
  token: string;
  limits: PlanLimits;
}

export async function createInbox(input: CreateInboxInput): Promise<CreatedInbox> {
  const settings = await getSettings();
  const plan = effectivePlan(input.principal.plan, settings);
  const limits = limitsFor(plan, settings);
  const db = getDb();

  await assertIpNotBlocked(input.ipHash);
  const subject = input.principal.userId ? `user:${input.principal.userId}` : `ip:${input.ipHash}`;
  await enforceRateLimit(
    "inbox.create",
    subject,
    limits.inboxCreatesPerHour,
    3600,
    "You have created too many addresses recently. Please wait before generating another.",
  );

  let domain: Domain | undefined;
  if (input.domain) {
    domain = await findDomainByName(input.domain);
    const available = domain
      ? (await getAvailableDomains(plan)).some((d) => d.id === domain!.id)
      : false;
    if (!domain || !available) {
      throw new ApiError(
        422,
        "domain_unavailable",
        "That domain is not available for new addresses.",
      );
    }
  } else {
    const available = await getAvailableDomains(plan);
    domain = available.find((d) => d.visibility === "public") ?? available[0];
  }
  if (!domain) {
    throw new ApiError(
      503,
      "no_domains",
      "No receiving domains are available yet. An administrator must configure and verify a domain first.",
    );
  }

  let ttlMinutes = domain.defaultTtlMinutes ?? limits.inboxTtlMinutes;
  if (input.ttlMinutes !== undefined) {
    if (!limits.customRetention) {
      throw errors.forbidden("Choosing a custom lifetime is not included in your plan.");
    }
    ttlMinutes = input.ttlMinutes;
  }
  ttlMinutes = Math.max(5, Math.min(ttlMinutes, limits.maxLifetimeMinutes));

  if (input.principal.userId) {
    const replacing = input.replaceInboxId ? 1 : 0;
    const [{ active } = { active: 0 }] = await db
      .select({ active: sql<number>`count(*)::int` })
      .from(inboxes)
      .where(and(eq(inboxes.userId, input.principal.userId), gt(inboxes.expiresAt, new Date())));
    if (active - replacing >= limits.maxConcurrentInboxes) {
      throw errors.conflict(
        `Your plan allows ${limits.maxConcurrentInboxes} active address${limits.maxConcurrentInboxes === 1 ? "" : "es"}. Delete one before creating another.`,
        "inbox_limit_reached",
      );
    }
  }

  const now = Date.now();
  const localPart = await allocateLocalPart(domain);
  const token = secrets.inboxToken();
  const created = await db.transaction(async (tx) => {
    const [inbox] = await tx
      .insert(inboxes)
      .values({
        publicId: publicIds.inbox(),
        localPart,
        domainId: domain.id,
        address: `${localPart}@${domain.name}`,
        userId: input.principal.userId,
        plan,
        createdIpHash: input.ipHash,
        expiresAt: new Date(now + ttlMinutes * MINUTE),
        maxExpiresAt: new Date(now + limits.maxLifetimeMinutes * MINUTE),
      })
      .returning();
    await tx.insert(inboxTokens).values({ inboxId: inbox!.id, tokenHash: sha256Hex(token) });
    await incrementStat("inboxesCreated", 1, tx);
    return inbox!;
  });

  if (input.replaceInboxId) {
    await deleteInboxById(input.replaceInboxId, "deleted").catch(() => undefined);
  }

  return { inbox: created, domain, token, limits };
}

/** Resolve an inbox from a bearer/cookie token. Expired inboxes are reported, not hidden. */
export async function findInboxByToken(
  token: string,
): Promise<(InboxWithDomain & { tokenId: string; expired: boolean }) | null> {
  if (!token.startsWith("tei_") || token.length > 100) return null;
  const db = getDb();
  const [row] = await db
    .select({
      inbox: inboxes,
      domain: domains,
      tokenId: inboxTokens.id,
      lastUsedAt: inboxTokens.lastUsedAt,
    })
    .from(inboxTokens)
    .innerJoin(inboxes, eq(inboxes.id, inboxTokens.inboxId))
    .innerJoin(domains, eq(domains.id, inboxes.domainId))
    .where(eq(inboxTokens.tokenHash, sha256Hex(token)))
    .limit(1);
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > MINUTE) {
    await db
      .update(inboxTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(inboxTokens.id, row.tokenId));
  }
  return {
    inbox: row.inbox,
    domain: row.domain,
    tokenId: row.tokenId,
    expired: row.inbox.expiresAt.getTime() <= Date.now(),
  };
}

export async function extendInbox(inbox: Inbox): Promise<Inbox> {
  const limits = await inboxLimits(inbox);
  if (limits.extendMinutes <= 0) {
    throw errors.forbidden("Extending the lifetime is not available on your plan.");
  }
  const now = Date.now();
  const base = Math.max(inbox.expiresAt.getTime(), now);
  const target = Math.min(base + limits.extendMinutes * MINUTE, inbox.maxExpiresAt.getTime());
  if (target <= inbox.expiresAt.getTime() + MINUTE) {
    throw errors.conflict("This address has reached its maximum lifetime.", "max_lifetime_reached");
  }
  const db = getDb();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(inboxes)
      .set({ expiresAt: new Date(target), extendedCount: sql`${inboxes.extendedCount} + 1` })
      .where(and(eq(inboxes.id, inbox.id), gt(inboxes.expiresAt, new Date())))
      .returning();
    if (!row) throw errors.gone("This address has expired.");
    await publishInboxEvent(
      row.id,
      { type: "inbox.updated", expiresAt: row.expiresAt.toISOString() },
      tx,
    );
    return row;
  });
  return updated;
}

export async function deleteInboxById(
  inboxId: string,
  reason: "deleted" | "expired",
): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(inboxes)
      .where(eq(inboxes.id, inboxId))
      .returning({ id: inboxes.id });
    if (deleted.length === 0) return false;
    await publishInboxEvent(inboxId, { type: "inbox.deleted", reason }, tx);
    return true;
  });
}

/** Inboxes owned by an account, newest first. */
export async function listUserInboxes(userId: string): Promise<InboxWithDomain[]> {
  const rows = await getDb()
    .select({ inbox: inboxes, domain: domains })
    .from(inboxes)
    .innerJoin(domains, eq(domains.id, inboxes.domainId))
    .where(and(eq(inboxes.userId, userId), gt(inboxes.expiresAt, new Date())))
    .orderBy(desc(inboxes.createdAt))
    .limit(200);
  return rows;
}

/** Issue a new access token for an inbox the user owns (switching inboxes in the app). */
export async function issueTokenForOwnedInbox(
  userId: string,
  publicId: string,
): Promise<CreatedInbox> {
  const db = getDb();
  const [row] = await db
    .select({ inbox: inboxes, domain: domains })
    .from(inboxes)
    .innerJoin(domains, eq(domains.id, inboxes.domainId))
    .where(
      and(
        eq(inboxes.publicId, publicId),
        eq(inboxes.userId, userId),
        gt(inboxes.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) throw errors.notFound("Inbox not found.");
  const token = secrets.inboxToken();
  await db.insert(inboxTokens).values({ inboxId: row.inbox.id, tokenHash: sha256Hex(token) });
  return { ...row, token, limits: await inboxLimits(row.inbox) };
}

export async function deleteOwnedInbox(userId: string, publicId: string): Promise<void> {
  const [row] = await getDb()
    .select({ id: inboxes.id })
    .from(inboxes)
    .where(and(eq(inboxes.publicId, publicId), eq(inboxes.userId, userId)))
    .limit(1);
  if (!row) throw errors.notFound("Inbox not found.");
  await deleteInboxById(row.id, "deleted");
}
