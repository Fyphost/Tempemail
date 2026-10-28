import { eq } from "drizzle-orm";
import type { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as inboxEvents } from "@/app/api/inboxes/current/events/route";
import { GET as listMessagesRoute } from "@/app/api/inboxes/current/messages/route";
import { POST as createInbox } from "@/app/api/inboxes/route";
import { GET as downloadAttachment } from "@/app/api/messages/[id]/attachments/[attachmentId]/route";
import { GET as messageBody } from "@/app/api/messages/[id]/body/route";
import { GET as getMessage } from "@/app/api/messages/[id]/route";
import { POST as mailgunWebhook } from "@/app/api/webhooks/mailgun/mime/route";
import { POST as inboundWebhook } from "@/app/api/webhooks/inbound/route";
import { getDb } from "@/server/db/client";
import { domains, ingestJobs, messages, webhookFailures } from "@/server/db/schema";
import { invalidateDomainCache } from "@/server/domains/service";
import { drainIngestQueue } from "@/server/jobs/runner";
import { closeSmtpServer, createSmtpServer, listen } from "@/server/mail/smtp";
import { getRealtimeBus } from "@/server/realtime/bus";
import { hmacSha256Hex } from "@/server/security/crypto";

import {
  buildMime,
  cookieHeader,
  createReceivingDomain,
  idParams,
  makeRequest,
  noParams,
  readJson,
  readSseUntil,
  sendSmtp,
  signedInboundHeaders,
  updateSettings,
} from "./helpers";

interface Created {
  address: string;
  token: string;
  cookie: string;
}

async function newInbox(ip = "203.0.113.10"): Promise<Created> {
  const response = await createInbox(
    makeRequest("POST", "/api/inboxes", { json: {}, ip }),
    noParams,
  );
  const body = await readJson<{ data: { inbox: { address: string }; token: string } }>(response);
  return {
    address: body.data.inbox.address,
    token: body.data.token,
    cookie: cookieHeader(response),
  };
}

async function listMessages(token: string, query = "") {
  const response = await listMessagesRoute(
    makeRequest("GET", `/api/inboxes/current/messages${query}`, { bearer: token }),
    noParams,
  );
  return readJson<{
    data: {
      messages: {
        id: string;
        subject: string;
        from: { address: string };
        preview: string;
        read: boolean;
      }[];
      total: number;
      unread: number;
      nextCursor: string | null;
    };
  }>(response);
}

let smtp: SMTPServer;
let port = 0;

beforeAll(async () => {
  smtp = await createSmtpServer({ hostname: "mx.test", maxClients: 20, useProxyProtocol: false });
  await listen(smtp, 0, "127.0.0.1");
  port = (smtp.server.address() as { port: number }).port;
});

afterAll(async () => {
  await closeSmtpServer(smtp);
});

describe("SMTP ingestion", () => {
  it("receives a real email over SMTP and exposes it through the API", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    const raw = await buildMime({
      to: inbox.address,
      subject: "Your login code is 482913",
      text: "Use 482913 to sign in. This code expires in 10 minutes.",
      html: '<p>Use <b>482913</b> to sign in.</p><img src="https://tracker.example/pixel.gif"><a href="https://acme.example/login">Sign in</a><script>alert(1)</script>',
    });
    const info = await sendSmtp(port, { from: "noreply@acme.example", to: [inbox.address] }, raw);
    expect(info.accepted).toEqual([inbox.address]);

    expect(await drainIngestQueue()).toBe(1);

    const list = await listMessages(inbox.token);
    expect(list.data.total).toBe(1);
    expect(list.data.unread).toBe(1);
    const summary = list.data.messages[0]!;
    expect(summary).toMatchObject({
      subject: "Your login code is 482913",
      from: { address: "noreply@acme.example" },
      read: false,
    });
    expect(summary.preview).toContain("482913");

    const detail = await readJson<{
      data: {
        message: {
          text: string;
          html: string;
          hasRemoteContent: boolean;
          envelopeTo: string;
          read: boolean;
        };
      };
    }>(
      await getMessage(
        makeRequest("GET", `/api/messages/${summary.id}`, { bearer: inbox.token }),
        idParams(summary.id),
      ),
    );
    expect(detail.data.message.text).toContain("expires in 10 minutes");
    expect(detail.data.message.html).not.toContain("<script");
    expect(detail.data.message.hasRemoteContent).toBe(true);
    expect(detail.data.message.envelopeTo).toBe(inbox.address);
    expect(detail.data.message.read).toBe(true);

    const blocked = await messageBody(
      makeRequest("GET", `/api/messages/${summary.id}/body`, { bearer: inbox.token }),
      idParams(summary.id),
    );
    expect(blocked.headers.get("content-security-policy")).toContain("script-src 'none'");
    expect(blocked.headers.get("content-security-policy")).toContain("img-src data:;");
    const blockedHtml = await blocked.text();
    expect(blockedHtml).not.toContain("tracker.example");
    expect(blockedHtml).not.toContain("<script");
    expect(blockedHtml).toContain('href="/link?u=https%3A%2F%2Facme.example%2Flogin"');
    expect(blockedHtml).toContain('rel="noopener noreferrer nofollow"');

    const allowed = await messageBody(
      makeRequest("GET", `/api/messages/${summary.id}/body?images=1`, { bearer: inbox.token }),
      idParams(summary.id),
    );
    expect(allowed.headers.get("content-security-policy")).toContain("img-src data: https:");
    expect(await allowed.text()).toContain('src="https://tracker.example/pixel.gif"');
  });

  it("refuses unknown recipients during RCPT TO", async () => {
    await createReceivingDomain();
    const raw = await buildMime({ to: "nobody@inbox.test", text: "hello" });
    await expect(
      sendSmtp(port, { from: "a@acme.example", to: ["nobody@inbox.test"] }, raw),
    ).rejects.toMatchObject({
      responseCode: 550,
    });
    await expect(
      sendSmtp(port, { from: "a@acme.example", to: ["x@not-ours.example"] }, raw),
    ).rejects.toMatchObject({
      responseCode: 550,
    });
    expect(await getDb().select().from(ingestJobs)).toHaveLength(0);
  });

  it("stores attachments, blocks executables and serves files as downloads", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    const raw = await buildMime({
      to: inbox.address,
      subject: "Invoice",
      text: "See attached",
      html: '<p>Logo: <img src="cid:logo@acme"></p>',
      attachments: [
        {
          filename: "invoice.pdf",
          content: Buffer.from("%PDF-1.4 fake"),
          contentType: "application/pdf",
        },
        {
          filename: "setup.exe",
          content: Buffer.from("MZ...."),
          contentType: "application/octet-stream",
        },
        {
          filename: "logo.png",
          content: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "base64",
          ),
          contentType: "image/png",
          cid: "logo@acme",
        },
      ],
    });
    await sendSmtp(port, { from: "billing@acme.example", to: [inbox.address] }, raw);
    await drainIngestQueue();

    const [summary] = (await listMessages(inbox.token)).data.messages;
    const detail = await readJson<{
      data: {
        message: {
          attachments: { id: string; filename: string; blocked: boolean; inline: boolean }[];
        };
      };
    }>(
      await getMessage(
        makeRequest("GET", `/api/messages/${summary!.id}`, { bearer: inbox.token }),
        idParams(summary!.id),
      ),
    );
    const files = detail.data.message.attachments;
    expect(files.map((f) => f.filename).sort()).toEqual(["invoice.pdf", "logo.png", "setup.exe"]);
    const exe = files.find((f) => f.filename === "setup.exe")!;
    const pdf = files.find((f) => f.filename === "invoice.pdf")!;
    expect(exe.blocked).toBe(true);
    expect(pdf.blocked).toBe(false);
    expect(files.find((f) => f.filename === "logo.png")!.inline).toBe(true);

    const params = (attachmentId: string) => ({
      params: Promise.resolve({ id: summary!.id, attachmentId }),
    });
    const download = await downloadAttachment(
      makeRequest("GET", `/api/messages/${summary!.id}/attachments/${pdf.id}`, {
        bearer: inbox.token,
      }),
      params(pdf.id),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/octet-stream");
    expect(download.headers.get("content-disposition")).toContain(
      'attachment; filename="invoice.pdf"',
    );
    expect(Buffer.from(await download.arrayBuffer()).toString()).toBe("%PDF-1.4 fake");

    const refused = await downloadAttachment(
      makeRequest("GET", `/api/messages/${summary!.id}/attachments/${exe.id}`, {
        bearer: inbox.token,
      }),
      params(exe.id),
    );
    expect(refused.status).toBe(403);

    const body = await messageBody(
      makeRequest("GET", `/api/messages/${summary!.id}/body`, { bearer: inbox.token }),
      idParams(summary!.id),
    );
    expect(await body.text()).toContain('src="data:image/png;base64,');
  });

  it("delivers plus-addressed mail to the base inbox", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    const [local, domain] = inbox.address.split("@");
    const tagged = `${local}+newsletter@${domain}`;
    await sendSmtp(
      port,
      { from: "news@acme.example", to: [tagged] },
      await buildMime({ to: tagged, text: "hi" }),
    );
    await drainIngestQueue();
    expect((await listMessages(inbox.token)).data.total).toBe(1);
  });

  it("rejects oversized messages", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    await updateSettings((s) => {
      s.plans.free.maxMessageSizeKb = 64;
      s.plans.premium.maxMessageSizeKb = 64;
    });
    const smallLimit = await createSmtpServer({
      hostname: "mx.test",
      maxClients: 5,
      useProxyProtocol: false,
    });
    await listen(smallLimit, 0, "127.0.0.1");
    try {
      const big = await buildMime({ to: inbox.address, text: "x".repeat(200 * 1024) });
      const limitedPort = (smallLimit.server.address() as { port: number }).port;
      await expect(
        sendSmtp(limitedPort, { from: "a@acme.example", to: [inbox.address] }, big),
      ).rejects.toMatchObject({ responseCode: 552 });
    } finally {
      await closeSmtpServer(smallLimit);
    }
    expect(await getDb().select().from(messages)).toHaveLength(0);
  });

  it("caps the number of stored messages per inbox", async () => {
    await createReceivingDomain();
    await updateSettings((s) => {
      s.plans.free.maxMessagesPerInbox = 2;
    });
    const inbox = await newInbox();
    for (let i = 0; i < 3; i += 1) {
      const raw = await buildMime({
        to: inbox.address,
        subject: `Message ${i}`,
        text: `Body ${i}`,
      });
      await sendSmtp(port, { from: "a@acme.example", to: [inbox.address] }, raw);
    }
    await drainIngestQueue();
    expect((await listMessages(inbox.token)).data.total).toBe(2);
    const rejected = await getDb()
      .select()
      .from(ingestJobs)
      .where(eq(ingestJobs.status, "rejected"));
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.lastError).toBe("mailbox_full");
  });

  it("verifies a domain when a test message reaches its probe address", async () => {
    const { createDomain } = await import("@/server/domains/service");
    const { SYSTEM_ACTOR } = await import("@/server/audit");
    const domain = await createDomain({ name: "newdomain.test" }, SYSTEM_ACTOR);
    const probe = `${domain.probeLocalPart}@newdomain.test`;
    await sendSmtp(
      port,
      { from: "admin@acme.example", to: [probe] },
      await buildMime({ to: probe, text: "test" }),
    );
    await drainIngestQueue();
    invalidateDomainCache();
    const [updated] = await getDb().select().from(domains).where(eq(domains.id, domain.id));
    expect(updated!.receiveStatus).toBe("verified");
    expect(updated!.receiveVerifiedAt).toBeInstanceOf(Date);
    expect(await getDb().select().from(messages)).toHaveLength(0);
  });
});

describe("real-time notifications", () => {
  it("publishes message.received to bus subscribers when a message is stored", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    const { findInboxByToken } = await import("@/server/inboxes/service");
    const found = await findInboxByToken(inbox.token);
    const received: unknown[] = [];
    const unsubscribe = await getRealtimeBus().subscribe(found!.inbox.id, (event) =>
      received.push(event),
    );
    try {
      await sendSmtp(
        port,
        { from: "a@acme.example", to: [inbox.address] },
        await buildMime({ to: inbox.address, text: "rt" }),
      );
      await drainIngestQueue();
      const deadline = Date.now() + 3_000;
      while (received.length === 0 && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 25));
      const [summary] = (await listMessages(inbox.token)).data.messages;
      expect(received).toEqual([{ type: "message.received", messageId: summary!.id }]);
    } finally {
      unsubscribe();
    }
  });

  it("streams events over Server-Sent Events", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    const controller = new AbortController();
    const request = makeRequest("GET", "/api/inboxes/current/events", { cookie: inbox.cookie });
    const response = await inboxEvents(
      new (request.constructor as typeof Request)(request, { signal: controller.signal }) as never,
      noParams,
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    setTimeout(() => {
      void (async () => {
        const raw = await buildMime({ to: inbox.address, subject: "Live", text: "now" });
        await sendSmtp(port, { from: "a@acme.example", to: [inbox.address] }, raw);
        await drainIngestQueue();
      })();
    }, 200);

    const events = await readSseUntil(
      response,
      (event) => event.event === "message.received",
      8_000,
    );
    controller.abort();
    expect(events[0]!.event).toBe("ready");
    const received = events.find((event) => event.event === "message.received");
    expect(received?.data).toMatchObject({
      type: "message.received",
      messageId: expect.stringMatching(/^msg_/),
    });
  });
});

describe("webhook ingestion", () => {
  it("accepts signed raw MIME and deduplicates retried deliveries", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    const raw = await buildMime({
      to: inbox.address,
      subject: "Via webhook",
      text: "hello from the edge",
    });
    const send = () =>
      inboundWebhook(
        makeRequest("POST", "/api/webhooks/inbound", {
          body: new Uint8Array(raw),
          headers: signedInboundHeaders(raw, inbox.address),
          origin: null,
        }),
        noParams,
      );
    const first = await send();
    expect(first.status).toBe(202);
    expect((await readJson(first)).data).toMatchObject({ status: "queued" });
    const retry = await send();
    expect((await readJson(retry)).data).toMatchObject({ status: "duplicate" });

    await drainIngestQueue();
    const list = await listMessages(inbox.token);
    expect(list.data.total).toBe(1);
    expect(list.data.messages[0]!.subject).toBe("Via webhook");
  });

  it("rejects invalid signatures, stale timestamps and unknown recipients", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    const raw = await buildMime({ to: inbox.address, text: "x" });

    const forged = await inboundWebhook(
      makeRequest("POST", "/api/webhooks/inbound", {
        body: new Uint8Array(raw),
        headers: signedInboundHeaders(raw, inbox.address, "a@b.c", "wrong-secret"),
        origin: null,
      }),
      noParams,
    );
    expect(forged.status).toBe(401);

    const stale = await inboundWebhook(
      makeRequest("POST", "/api/webhooks/inbound", {
        body: new Uint8Array(raw),
        headers: signedInboundHeaders(
          raw,
          inbox.address,
          "a@b.c",
          undefined,
          String(Math.floor(Date.now() / 1000) - 3600),
        ),
        origin: null,
      }),
      noParams,
    );
    expect(stale.status).toBe(401);

    const tampered = Buffer.concat([raw, Buffer.from("tampered")]);
    const tamperedResponse = await inboundWebhook(
      makeRequest("POST", "/api/webhooks/inbound", {
        body: new Uint8Array(tampered),
        headers: signedInboundHeaders(raw, inbox.address),
        origin: null,
      }),
      noParams,
    );
    expect(tamperedResponse.status).toBe(401);

    const unknown = await inboundWebhook(
      makeRequest("POST", "/api/webhooks/inbound", {
        body: new Uint8Array(raw),
        headers: signedInboundHeaders(raw, "ghost@inbox.test"),
        origin: null,
      }),
      noParams,
    );
    expect(unknown.status).toBe(404);

    const failures = await getDb().select().from(webhookFailures);
    expect(failures.map((f) => f.reason).sort()).toEqual([
      "invalid_signature",
      "invalid_signature",
      "invalid_signature",
      "unknown_recipient",
    ]);
    expect(await getDb().select().from(ingestJobs)).toHaveLength(0);
  });

  it("accepts Mailgun MIME routes with valid signatures and blocks token replay", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    const raw = await buildMime({ to: inbox.address, subject: "From Mailgun", text: "routed" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "a".repeat(50);
    const signature = hmacSha256Hex(
      process.env.MAILGUN_WEBHOOK_SIGNING_KEY!,
      `${timestamp}${token}`,
    );
    const form = (body: string, sig = signature) =>
      new URLSearchParams({
        recipient: inbox.address,
        sender: "bounce@mailgun.example",
        timestamp,
        token,
        signature: sig,
        "body-mime": body,
      }).toString();
    const post = (payload: string) =>
      mailgunWebhook(
        makeRequest("POST", "/api/webhooks/mailgun/mime", {
          body: payload,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          origin: null,
        }),
        noParams,
      );

    const bad = await post(form(raw.toString("utf8"), "0".repeat(64)));
    expect(bad.status).toBe(401);

    const accepted = await post(form(raw.toString("utf8")));
    expect(accepted.status).toBe(200);
    expect((await readJson(accepted)).data).toMatchObject({ status: "queued" });

    // Same token with a different body must not be processed.
    const replay = await post(
      form(
        (await buildMime({ to: inbox.address, subject: "Injected", text: "evil" })).toString(
          "utf8",
        ),
      ),
    );
    expect((await readJson(replay)).data).toMatchObject({ status: "duplicate" });

    await drainIngestQueue();
    const list = await listMessages(inbox.token);
    expect(list.data.messages.map((m) => m.subject)).toEqual(["From Mailgun"]);
  });
});
