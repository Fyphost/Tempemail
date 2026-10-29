import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { GET as listDomains } from "@/app/api/domains/route";
import { GET as getCurrent } from "@/app/api/inboxes/current/route";
import { GET as listInboxes, POST as createInboxRoute } from "@/app/api/inboxes/route";
import {
  blockNetwork,
  getOverviewStats,
  searchInboxes,
  unblockNetwork,
  listIpBlocks,
} from "@/server/admin/service";
import { SYSTEM_ACTOR } from "@/server/audit";
import { createApiKey, revokeApiKey } from "@/server/auth/api-keys";
import {
  authenticateUser,
  createUser,
  createUserSession,
  getUserBySessionToken,
  updateUserByAdmin,
  type SessionUser,
} from "@/server/auth/users";
import { getDb } from "@/server/db/client";
import { auditLogs, ingestJobs, messages } from "@/server/db/schema";
import { retryIngestJob } from "@/server/jobs/queue";
import { drainIngestQueue } from "@/server/jobs/runner";
import { hashIp } from "@/server/security/ip";
import { isIpBlocked } from "@/server/security/rate-limit";
import { sha256Hex } from "@/server/security/crypto";

import {
  buildMime,
  cookieHeader,
  createReceivingDomain,
  makeRequest,
  noParams,
  readJson,
  updateSettings,
} from "./helpers";

async function sessionUserFor(
  email: string,
  plan: "free" | "premium" = "free",
): Promise<SessionUser> {
  const user = await createUser({ email, password: "correct-horse-battery", plan }, SYSTEM_ACTOR);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    status: user.status,
    sessionId: "test",
  };
}

const create = (options: Parameters<typeof makeRequest>[2] = {}) =>
  createInboxRoute(makeRequest("POST", "/api/inboxes", { json: {}, ...options }), noParams);

describe("accounts and sessions", () => {
  it("authenticates users and rejects disabled accounts", async () => {
    const user = await createUser(
      { email: "Person@Example.com", password: "correct-horse-battery" },
      SYSTEM_ACTOR,
    );
    expect(user.email).toBe("person@example.com");
    expect(await authenticateUser("person@example.com", "wrong-password")).toBeNull();
    expect(await authenticateUser("nobody@example.com", "whatever-password")).toBeNull();
    expect((await authenticateUser("PERSON@example.com", "correct-horse-battery"))?.id).toBe(
      user.id,
    );

    const session = await createUserSession(user.id, {});
    expect((await getUserBySessionToken(session.token))?.email).toBe("person@example.com");
    expect(await getUserBySessionToken("forged-token-value-that-is-long")).toBeNull();

    await updateUserByAdmin(user.id, { status: "disabled" }, SYSTEM_ACTOR);
    expect(await getUserBySessionToken(session.token)).toBeNull();
    expect(await authenticateUser("person@example.com", "correct-horse-battery")).toBeNull();
  });

  it("rejects weak passwords and duplicate emails", async () => {
    await expect(
      createUser({ email: "a@example.com", password: "short" }, SYSTEM_ACTOR),
    ).rejects.toMatchObject({ status: 400 });
    await createUser({ email: "a@example.com", password: "long-enough-password" }, SYSTEM_ACTOR);
    await expect(
      createUser({ email: "A@example.com", password: "long-enough-password" }, SYSTEM_ACTOR),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("API keys and plans", () => {
  it("lets premium accounts create owned inboxes with an API key", async () => {
    await createReceivingDomain("inbox.test");
    await createReceivingDomain("vip.test", { visibility: "premium" });
    await updateSettings((s) => {
      s.premiumEnabled = true;
      s.plans.premium.maxConcurrentInboxes = 2;
    });
    const user = await sessionUserFor("dev@example.com", "premium");
    const { key } = await createApiKey(user, "CI");
    expect(key).toMatch(/^tek_/);

    const domains = await readJson<{ data: { domains: { name: string }[] } }>(
      await listDomains(makeRequest("GET", "/api/domains", { bearer: key }), noParams),
    );
    expect(domains.data.domains.map((d) => d.name).sort()).toEqual(["inbox.test", "vip.test"]);

    const first = await create({ bearer: key, json: { domain: "vip.test", ttlMinutes: 2_880 } });
    expect(first.status).toBe(201);
    expect(first.headers.getSetCookie()).toHaveLength(0);
    const body = await readJson<{
      data: {
        inbox: {
          owned: boolean;
          plan: string;
          address: string;
          expiresAt: string;
          createdAt: string;
        };
      };
    }>(first);
    expect(body.data.inbox).toMatchObject({ owned: true, plan: "premium" });
    expect(body.data.inbox.address.endsWith("@vip.test")).toBe(true);
    const lifetime = Date.parse(body.data.inbox.expiresAt) - Date.parse(body.data.inbox.createdAt);
    expect(Math.round(lifetime / 60_000)).toBe(2_880);

    expect((await create({ bearer: key })).status).toBe(201);
    const third = await create({ bearer: key });
    expect(third.status).toBe(409);
    expect((await readJson(third)).error).toMatchObject({ code: "inbox_limit_reached" });

    const listed = await readJson<{ data: { inboxes: unknown[] } }>(
      await listInboxes(makeRequest("GET", "/api/inboxes", { bearer: key }), noParams),
    );
    expect(listed.data.inboxes).toHaveLength(2);
  });

  it("does not grant premium features while premium is disabled", async () => {
    await createReceivingDomain("inbox.test");
    await createReceivingDomain("vip.test", { visibility: "premium" });
    const user = await sessionUserFor("dev@example.com", "premium");
    await expect(createApiKey(user, "CI")).rejects.toMatchObject({ status: 403 });
    const session = await createUserSession(user.id, {});
    const cookie = `te_session=${session.token}`;
    const domains = await readJson<{ data: { domains: { name: string }[] } }>(
      await listDomains(makeRequest("GET", "/api/domains", { cookie }), noParams),
    );
    expect(domains.data.domains.map((d) => d.name)).toEqual(["inbox.test"]);
  });

  it("refuses custom lifetimes for anonymous visitors and API keys for free accounts", async () => {
    await createReceivingDomain();
    const anonymous = await create({ json: { ttlMinutes: 600 } });
    expect(anonymous.status).toBe(403);
    const user = await sessionUserFor("free@example.com");
    await expect(createApiKey(user, "nope")).rejects.toMatchObject({ status: 403 });
  });

  it("stops accepting revoked keys", async () => {
    await createReceivingDomain();
    await updateSettings((s) => {
      s.premiumEnabled = true;
    });
    const user = await sessionUserFor("dev@example.com", "premium");
    const { key, view } = await createApiKey(user, "temp");
    await revokeApiKey(user, view.id);
    const response = await create({ bearer: key });
    expect(response.status).toBe(401);
  });

  it("honours the programmatic API switch without breaking browser sessions", async () => {
    await createReceivingDomain();
    const created = await create();
    const body = await readJson<{ data: { token: string } }>(created);
    await updateSettings((s) => {
      s.api.enabled = false;
    });
    expect(
      (
        await getCurrent(
          makeRequest("GET", "/api/inboxes/current", { bearer: body.data.token }),
          noParams,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await getCurrent(
          makeRequest("GET", "/api/inboxes/current", { cookie: cookieHeader(created) }),
          noParams,
        )
      ).status,
    ).toBe(200);
  });
});

describe("admin operations", () => {
  it("blocks and unblocks networks without storing raw IPs", async () => {
    await createReceivingDomain();
    await blockNetwork({ ip: "198.51.100.23", reason: "Automated abuse", hours: 24 }, SYSTEM_ACTOR);
    expect(await isIpBlocked(hashIp("198.51.100.23"))).toBe(true);
    const blocks = await listIpBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.label).toBe("198.51.100.x");
    expect(JSON.stringify(blocks)).not.toContain("198.51.100.23");
    expect((await create({ ip: "198.51.100.23" })).status).toBe(403);

    await unblockNetwork(blocks[0]!.id, SYSTEM_ACTOR);
    expect(await isIpBlocked(hashIp("198.51.100.23"))).toBe(false);
    expect((await create({ ip: "198.51.100.23" })).status).toBe(201);

    const actions = (await getDb().select().from(auditLogs)).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["ip.blocked", "ip.unblocked"]));
  });

  it("reports overview statistics and searches inboxes", async () => {
    await createReceivingDomain();
    const created = await readJson<{ data: { inbox: { address: string } } }>(await create());
    const { acceptInbound } = await import("@/server/mail/inbound");
    await acceptInbound({
      provider: "webhook",
      raw: await buildMime({ to: created.data.inbox.address, text: "stats" }),
      recipients: [created.data.inbox.address],
    });
    await drainIngestQueue();

    const stats = await getOverviewStats();
    expect(stats.totalInboxesCreated).toBe(1);
    expect(stats.activeInboxes).toBe(1);
    expect(stats.totalEmailsReceived).toBe(1);
    expect(stats.jobsCompleted).toBe(1);
    expect(stats.domainsReceiving).toBe(1);
    expect(stats.series).toHaveLength(14);
    expect(stats.storage.databaseBytes).toBeGreaterThan(0);

    const local = created.data.inbox.address.split("@")[0]!;
    const found = await searchInboxes({ query: local.slice(0, 6), status: "active", page: 1 });
    expect(found.rows.map((row) => row.address)).toEqual([created.data.inbox.address]);
    expect((await searchInboxes({ query: "nomatch", status: "all", page: 1 })).total).toBe(0);
  });

  it("retries failed ingestion jobs that still have their payload", async () => {
    await createReceivingDomain();
    const created = await readJson<{ data: { inbox: { address: string } } }>(await create());
    const raw = await buildMime({
      to: created.data.inbox.address,
      subject: "Retried",
      text: "second attempt",
    });
    const [job] = await getDb()
      .insert(ingestJobs)
      .values({
        provider: "smtp",
        dedupeKey: `${sha256Hex(raw)}:retry-test`,
        status: "failed",
        recipients: [created.data.inbox.address],
        raw,
        rawSize: raw.length,
        attempts: 5,
        lastError: "simulated outage",
      })
      .returning();

    await retryIngestJob(job!.id, SYSTEM_ACTOR);
    expect(await drainIngestQueue()).toBe(1);
    const [after] = await getDb().select().from(ingestJobs).where(eq(ingestJobs.id, job!.id));
    expect(after!.status).toBe("completed");
    expect(after!.raw).toBeNull();
    expect((await getDb().select().from(messages)).map((m) => m.subject)).toEqual(["Retried"]);
    await expect(retryIngestJob(job!.id, SYSTEM_ACTOR)).rejects.toMatchObject({ status: 409 });
  });
});
