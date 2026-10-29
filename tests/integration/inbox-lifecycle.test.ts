import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { GET as listDomains } from "@/app/api/domains/route";
import { DELETE as deleteCurrent, GET as getCurrent } from "@/app/api/inboxes/current/route";
import { POST as extendCurrent } from "@/app/api/inboxes/current/extend/route";
import { POST as createInbox } from "@/app/api/inboxes/route";
import { getDb } from "@/server/db/client";
import { inboxes, ipBlocks } from "@/server/db/schema";
import { hashIp } from "@/server/security/ip";

import {
  cookieHeader,
  createReceivingDomain,
  makeRequest,
  noParams,
  readJson,
  updateSettings,
} from "./helpers";

interface InboxBody {
  data: {
    inbox: {
      id: string;
      address: string;
      expiresAt: string;
      maxExpiresAt: string;
      limits: { canExtend: boolean };
    };
    token: string;
  };
}

async function create(options: Parameters<typeof makeRequest>[2] = {}) {
  const response = await createInbox(
    makeRequest("POST", "/api/inboxes", { json: {}, ...options }),
    noParams,
  );
  return response;
}

describe("inbox lifecycle", () => {
  it("refuses to create addresses before any domain is verified", async () => {
    const response = await create();
    expect(response.status).toBe(503);
    expect((await readJson(response)).error).toMatchObject({ code: "no_domains" });
  });

  it("lists only enabled domains that passed receive verification", async () => {
    await createReceivingDomain("live.test");
    await createReceivingDomain("vip.test", { visibility: "premium" });
    const { createDomain } = await import("@/server/domains/service");
    const { SYSTEM_ACTOR } = await import("@/server/audit");
    await createDomain({ name: "pending.test" }, SYSTEM_ACTOR);

    const response = await listDomains(makeRequest("GET", "/api/domains"), noParams);
    const body = await readJson<{ data: { domains: { name: string }[]; defaultDomain: string } }>(
      response,
    );
    expect(body.data.domains.map((d) => d.name)).toEqual(["live.test"]);
    expect(body.data.defaultDomain).toBe("live.test");

    const rejected = await create({ json: { domain: "pending.test" } });
    expect(rejected.status).toBe(422);
    const premium = await create({ json: { domain: "vip.test" } });
    expect(premium.status).toBe(422);
  });

  it("creates an inbox with a secret token and a hardened session cookie", async () => {
    await createReceivingDomain("inbox.test");
    const response = await create();
    expect(response.status).toBe(201);
    const body = await readJson<InboxBody>(response);
    expect(body.data.inbox.address).toMatch(/^[a-z]{8}\d{4}@inbox\.test$/);
    expect(body.data.inbox.id).toMatch(/^inb_/);
    expect(body.data.token).toMatch(/^tei_[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(body)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no internal UUIDs

    const setCookie = response.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/te_inbox=tei_/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);

    const viaCookie = await getCurrent(
      makeRequest("GET", "/api/inboxes/current", { cookie: cookieHeader(response) }),
      noParams,
    );
    expect(viaCookie.status).toBe(200);
    expect((await readJson<InboxBody>(viaCookie)).data.inbox.address).toBe(body.data.inbox.address);

    const viaBearer = await getCurrent(
      makeRequest("GET", "/api/inboxes/current", { bearer: body.data.token }),
      noParams,
    );
    expect(viaBearer.status).toBe(200);

    const anonymous = await getCurrent(makeRequest("GET", "/api/inboxes/current"), noParams);
    expect(anonymous.status).toBe(401);
    const forged = await getCurrent(
      makeRequest("GET", "/api/inboxes/current", { bearer: `tei_${"A".repeat(43)}` }),
      noParams,
    );
    expect(forged.status).toBe(401);
  });

  it("rejects cross-site requests that rely on the session cookie", async () => {
    await createReceivingDomain();
    const created = await create();
    const response = await deleteCurrent(
      makeRequest("DELETE", "/api/inboxes/current", {
        cookie: cookieHeader(created),
        origin: "https://evil.example",
      }),
      noParams,
    );
    expect(response.status).toBe(403);
    const crossSiteCreate = await create({ origin: "https://evil.example" });
    expect(crossSiteCreate.status).toBe(403);
  });

  it("replaces the current anonymous inbox when asked", async () => {
    await createReceivingDomain();
    const first = await create();
    const firstBody = await readJson<InboxBody>(first);
    const second = await create({ json: { replaceCurrent: true }, cookie: cookieHeader(first) });
    expect(second.status).toBe(201);
    const rows = await getDb().select().from(inboxes);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.address).not.toBe(firstBody.data.inbox.address);
  });

  it("extends lifetime up to the plan maximum", async () => {
    await createReceivingDomain();
    await updateSettings((s) => {
      s.plans.free.inboxTtlMinutes = 60;
      s.plans.free.extendMinutes = 60;
      s.plans.free.maxLifetimeMinutes = 120;
    });
    const created = await create();
    const before = await readJson<InboxBody>(created);
    const cookie = cookieHeader(created);

    const extended = await extendCurrent(
      makeRequest("POST", "/api/inboxes/current/extend", { cookie }),
      noParams,
    );
    expect(extended.status).toBe(200);
    const after = await readJson<InboxBody>(extended);
    const delta = Date.parse(after.data.inbox.expiresAt) - Date.parse(before.data.inbox.expiresAt);
    expect(delta).toBeGreaterThan(59 * 60_000);
    expect(after.data.inbox.limits.canExtend).toBe(false);

    const again = await extendCurrent(
      makeRequest("POST", "/api/inboxes/current/extend", { cookie }),
      noParams,
    );
    expect(again.status).toBe(409);
    expect((await readJson(again)).error).toMatchObject({ code: "max_lifetime_reached" });
  });

  it("deletes the inbox and clears the cookie", async () => {
    await createReceivingDomain();
    const created = await create();
    const cookie = cookieHeader(created);
    const deleted = await deleteCurrent(
      makeRequest("DELETE", "/api/inboxes/current", { cookie }),
      noParams,
    );
    expect(deleted.status).toBe(200);
    expect(deleted.headers.getSetCookie().join(";")).toMatch(/te_inbox=;/);
    expect(await getDb().select().from(inboxes)).toHaveLength(0);
    const after = await getCurrent(
      makeRequest("GET", "/api/inboxes/current", { cookie }),
      noParams,
    );
    expect(after.status).toBe(401);
  });

  it("reports expired inboxes with 410 until cleanup removes them", async () => {
    await createReceivingDomain();
    const created = await create();
    await getDb()
      .update(inboxes)
      .set({ expiresAt: new Date(Date.now() - 1_000) });
    const response = await getCurrent(
      makeRequest("GET", "/api/inboxes/current", { cookie: cookieHeader(created) }),
      noParams,
    );
    expect(response.status).toBe(410);
    expect((await readJson(response)).error).toMatchObject({ code: "inbox_expired" });
  });

  it("rate-limits address generation per client IP", async () => {
    await createReceivingDomain();
    await updateSettings((s) => {
      s.plans.free.inboxCreatesPerHour = 2;
    });
    expect((await create({ ip: "198.51.100.7" })).status).toBe(201);
    expect((await create({ ip: "198.51.100.7" })).status).toBe(201);
    const limited = await create({ ip: "198.51.100.7" });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await create({ ip: "198.51.100.8" })).status).toBe(201);
  });

  it("blocks address generation from blocked networks", async () => {
    await createReceivingDomain();
    await getDb()
      .insert(ipBlocks)
      .values({ ipHash: hashIp("192.0.2.55"), label: "192.0.2.x", reason: "abuse" });
    const blocked = await create({ ip: "192.0.2.55" });
    expect(blocked.status).toBe(403);
    expect((await create({ ip: "192.0.2.56" })).status).toBe(201);
  });

  it("enforces the domain default lifetime override", async () => {
    const domain = await createReceivingDomain();
    const { updateDomain } = await import("@/server/domains/service");
    const { SYSTEM_ACTOR } = await import("@/server/audit");
    await updateDomain(domain.id, { defaultTtlMinutes: 15 }, SYSTEM_ACTOR);
    const created = await readJson<InboxBody>(await create());
    const [row] = await getDb()
      .select()
      .from(inboxes)
      .where(eq(inboxes.publicId, created.data.inbox.id));
    const minutes = (row!.expiresAt.getTime() - row!.createdAt.getTime()) / 60_000;
    expect(Math.round(minutes)).toBe(15);
  });
});
