import { asc, eq, sql } from "drizzle-orm";

import { writeAudit, type AuditActor, SYSTEM_ACTOR } from "@/server/audit";
import { getDb } from "@/server/db/client";
import {
  domains,
  inboxes,
  type Domain,
  type DomainVisibility,
  type PlanId,
} from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { errors } from "@/server/http/errors";
import { generateLocalPart, normalizeDomain } from "@/server/mail/address";
import { randomBase62 } from "@/server/security/crypto";

import { lookupMx, mxMatchesExpected } from "./dns";

const CACHE_TTL_MS = 15_000;
const globals = globalThis as typeof globalThis & {
  __tempemailDomains?: { rows: Domain[]; loadedAt: number };
};

export function invalidateDomainCache(): void {
  globals.__tempemailDomains = undefined;
}

export async function getAllDomains(options: { fresh?: boolean } = {}): Promise<Domain[]> {
  const cached = globals.__tempemailDomains;
  if (!options.fresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.rows;
  const rows = await getDb().select().from(domains).orderBy(asc(domains.name));
  globals.__tempemailDomains = { rows, loadedAt: Date.now() };
  return rows;
}

export async function findDomainByName(name: string): Promise<Domain | undefined> {
  const normalized = normalizeDomain(name);
  if (!normalized) return undefined;
  return (await getAllDomains()).find((domain) => domain.name === normalized);
}

export function expectedMxFor(domain: Pick<Domain, "expectedMx">): string[] {
  return domain.expectedMx.length > 0 ? domain.expectedMx : getEnv().MX_TARGETS;
}

/**
 * A domain is offered to users only when it is enabled, a real test message
 * has been received through the inbound pipeline, and (unless explicitly
 * skipped for local development) its MX records point at our infrastructure.
 */
export function isDomainReceiving(domain: Domain): boolean {
  if (!domain.isEnabled) return false;
  if (domain.receiveStatus !== "verified") return false;
  if (domain.mxStatus === "verified") return true;
  return getEnv().SKIP_MX_CHECK;
}

export function canUseDomain(domain: Domain, plan: PlanId): boolean {
  if (!isDomainReceiving(domain)) return false;
  return domain.visibility === "public" || plan === "premium";
}

export async function getAvailableDomains(plan: PlanId): Promise<Domain[]> {
  return (await getAllDomains()).filter((domain) => canUseDomain(domain, plan));
}

export interface DomainVerificationState {
  receiving: boolean;
  mxOk: boolean;
  receiveOk: boolean;
  probeAddress: string;
  expectedMx: string[];
}

export function domainVerificationState(domain: Domain): DomainVerificationState {
  return {
    receiving: isDomainReceiving(domain),
    mxOk: domain.mxStatus === "verified",
    receiveOk: domain.receiveStatus === "verified",
    probeAddress: `${domain.probeLocalPart}@${domain.name}`,
    expectedMx: expectedMxFor(domain),
  };
}

function newProbeLocalPart(): string {
  return `verify-${randomBase62(10).toLowerCase()}`;
}

export async function createDomain(
  input: {
    name: string;
    visibility?: DomainVisibility;
    expectedMx?: string[];
    defaultTtlMinutes?: number | null;
  },
  actor: AuditActor,
): Promise<Domain> {
  const name = normalizeDomain(input.name);
  if (!name) throw errors.badRequest("Enter a valid domain name, for example mail.example.com.");
  const db = getDb();
  const existing = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.name, name))
    .limit(1);
  if (existing.length > 0)
    throw errors.conflict("That domain is already configured.", "domain_exists");
  const [domain] = await db
    .insert(domains)
    .values({
      name,
      visibility: input.visibility ?? "public",
      expectedMx: (input.expectedMx ?? []).map((host) => host.trim().toLowerCase()).filter(Boolean),
      defaultTtlMinutes: input.defaultTtlMinutes ?? null,
      probeLocalPart: newProbeLocalPart(),
      isEnabled: false,
    })
    .returning();
  invalidateDomainCache();
  await writeAudit(actor, "domain.created", { type: "domain", id: name });
  return domain!;
}

export async function updateDomain(
  id: string,
  patch: Partial<Pick<Domain, "isEnabled" | "visibility" | "expectedMx" | "defaultTtlMinutes">>,
  actor: AuditActor,
): Promise<Domain> {
  const db = getDb();
  const [domain] = await db
    .update(domains)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(domains.id, id))
    .returning();
  if (!domain) throw errors.notFound("Domain not found.");
  invalidateDomainCache();
  await writeAudit(actor, "domain.updated", { type: "domain", id: domain.name }, { ...patch });
  return domain;
}

export async function deleteDomain(id: string, actor: AuditActor): Promise<void> {
  const db = getDb();
  const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
  if (!domain) throw errors.notFound("Domain not found.");
  const [{ active } = { active: 0 }] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(inboxes)
    .where(sql`${inboxes.domainId} = ${id} and ${inboxes.expiresAt} > now()`);
  if (domain.isEnabled || active > 0) {
    throw errors.conflict(
      "Disable the domain and wait for its active inboxes to expire (or delete them) before removing it.",
      "domain_in_use",
    );
  }
  await db.delete(domains).where(eq(domains.id, id));
  invalidateDomainCache();
  await writeAudit(actor, "domain.deleted", { type: "domain", id: domain.name });
}

export async function rotateProbeAddress(id: string, actor: AuditActor): Promise<Domain> {
  const db = getDb();
  const [domain] = await db
    .update(domains)
    .set({ probeLocalPart: newProbeLocalPart(), updatedAt: new Date() })
    .where(eq(domains.id, id))
    .returning();
  if (!domain) throw errors.notFound("Domain not found.");
  invalidateDomainCache();
  await writeAudit(actor, "domain.probe_rotated", { type: "domain", id: domain.name });
  return domain;
}

export async function checkDomainDns(
  id: string,
  actor: AuditActor = SYSTEM_ACTOR,
): Promise<Domain> {
  const db = getDb();
  const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
  if (!domain) throw errors.notFound("Domain not found.");
  const expected = expectedMxFor(domain);
  const result = await lookupMx(domain.name);
  let mxStatus: Domain["mxStatus"];
  if (result.error) mxStatus = "error";
  else if (result.missing) mxStatus = "missing";
  else if (expected.length > 0 && mxMatchesExpected(result.hosts, expected)) mxStatus = "verified";
  else mxStatus = "mismatch";

  const [updated] = await db
    .update(domains)
    .set({
      mxStatus,
      mxRecords: result.hosts,
      mxError:
        result.error ??
        (mxStatus === "mismatch" && expected.length === 0
          ? "No expected MX hosts are configured (set MX_TARGETS or the domain's expected MX)."
          : null),
      mxCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(domains.id, id))
    .returning();
  invalidateDomainCache();
  if (actor !== SYSTEM_ACTOR || updated!.mxStatus !== domain.mxStatus) {
    await writeAudit(
      actor,
      "domain.dns_checked",
      { type: "domain", id: domain.name },
      {
        mxStatus,
        hosts: result.hosts,
      },
    );
  }
  return updated!;
}

export async function markDomainReceiveVerified(domainId: string): Promise<void> {
  const db = getDb();
  const [updated] = await db
    .update(domains)
    .set({ receiveStatus: "verified", receiveVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(domains.id, domainId))
    .returning({ name: domains.name });
  invalidateDomainCache();
  if (updated) {
    await writeAudit(SYSTEM_ACTOR, "domain.receive_verified", { type: "domain", id: updated.name });
  }
}

/** Returns a fresh random local part that is not currently in use on the domain. */
export async function allocateLocalPart(domain: Domain, attempts = 6): Promise<string> {
  const db = getDb();
  for (let i = 0; i < attempts; i += 1) {
    const local = generateLocalPart();
    if (local === domain.probeLocalPart) continue;
    const [existing] = await db
      .select({ id: inboxes.id })
      .from(inboxes)
      .where(eq(inboxes.address, `${local}@${domain.name}`))
      .limit(1);
    if (!existing) return local;
  }
  throw errors.unavailable("Could not allocate an address. Please try again.");
}
