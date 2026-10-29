import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { GET as listMessagesRoute } from "@/app/api/inboxes/current/messages/route";
import { GET as getCurrent } from "@/app/api/inboxes/current/route";
import { POST as createInbox } from "@/app/api/inboxes/route";
import { GET as downloadAttachment } from "@/app/api/messages/[id]/attachments/[attachmentId]/route";
import { GET as messageBody } from "@/app/api/messages/[id]/body/route";
import {
  DELETE as deleteMessage,
  GET as getMessage,
  PATCH as patchMessage,
} from "@/app/api/messages/[id]/route";
import { getDb } from "@/server/db/client";
import { attachments, inboxes, messages } from "@/server/db/schema";
import { runCleanup } from "@/server/jobs/cleanup";
import { drainIngestQueue } from "@/server/jobs/runner";
import { acceptInbound } from "@/server/mail/inbound";
import { getRealtimeBus } from "@/server/realtime/bus";

import {
  buildMime,
  createReceivingDomain,
  idParams,
  makeRequest,
  noParams,
  readJson,
} from "./helpers";

async function newInbox(ip = "203.0.113.20") {
  const response = await createInbox(
    makeRequest("POST", "/api/inboxes", { json: {}, ip }),
    noParams,
  );
  const body = await readJson<{ data: { inbox: { address: string }; token: string } }>(response);
  return { address: body.data.inbox.address, token: body.data.token };
}

async function deliver(
  to: string,
  subject: string,
  extra: Partial<Parameters<typeof buildMime>[0]> = {},
) {
  const raw = await buildMime({ to, subject, text: `Body of ${subject}`, ...extra });
  await acceptInbound({ provider: "webhook", raw, recipients: [to] });
  await drainIngestQueue();
}

async function list(token: string, query = "") {
  const response = await listMessagesRoute(
    makeRequest("GET", `/api/inboxes/current/messages${query}`, { bearer: token }),
    noParams,
  );
  return readJson<{
    data: {
      messages: { id: string; subject: string; read: boolean }[];
      nextCursor: string | null;
      total: number;
    };
  }>(response);
}

describe("cross-inbox isolation", () => {
  it("never exposes one inbox's messages or attachments to another inbox", async () => {
    await createReceivingDomain();
    const alice = await newInbox("203.0.113.21");
    const mallory = await newInbox("203.0.113.22");
    await deliver(alice.address, "Private", {
      attachments: [{ filename: "secret.txt", content: "top secret", contentType: "text/plain" }],
    });
    const [message] = (await list(alice.token)).data.messages;
    const [file] = await getDb().select().from(attachments);

    const asMallory = { bearer: mallory.token };
    expect(
      (
        await getMessage(
          makeRequest("GET", `/api/messages/${message!.id}`, asMallory),
          idParams(message!.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await messageBody(
          makeRequest("GET", `/api/messages/${message!.id}/body`, asMallory),
          idParams(message!.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await downloadAttachment(
          makeRequest(
            "GET",
            `/api/messages/${message!.id}/attachments/${file!.publicId}`,
            asMallory,
          ),
          { params: Promise.resolve({ id: message!.id, attachmentId: file!.publicId }) },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await patchMessage(
          makeRequest("PATCH", `/api/messages/${message!.id}`, {
            ...asMallory,
            json: { read: true },
          }),
          idParams(message!.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await deleteMessage(
          makeRequest("DELETE", `/api/messages/${message!.id}`, asMallory),
          idParams(message!.id),
        )
      ).status,
    ).toBe(404);
    expect((await list(mallory.token)).data.total).toBe(0);

    // Alice still has her message.
    expect((await list(alice.token)).data.total).toBe(1);
  });

  it("does not treat knowledge of the email address as authorization", async () => {
    await createReceivingDomain();
    const alice = await newInbox();
    const response = await getCurrent(
      makeRequest("GET", "/api/inboxes/current", {
        headers: { authorization: `Bearer ${alice.address}` },
      }),
      noParams,
    );
    expect(response.status).toBe(401);
  });

  it("rejects malformed message identifiers without leaking existence", async () => {
    await createReceivingDomain();
    const alice = await newInbox();
    for (const id of ["1", "msg_", "../../etc/passwd", "msg_' or 1=1 --"]) {
      const response = await getMessage(
        makeRequest("GET", `/api/messages/${encodeURIComponent(id)}`, { bearer: alice.token }),
        idParams(id),
      );
      expect(response.status).toBe(404);
    }
  });
});

describe("message management", () => {
  it("supports search, unread filtering, read state and cursor pagination", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    for (const subject of [
      "Welcome aboard",
      "Reset your password",
      "Weekly digest",
      "Your receipt",
    ]) {
      await deliver(inbox.address, subject);
    }
    const all = await list(inbox.token);
    expect(all.data.total).toBe(4);
    expect(all.data.messages[0]!.subject).toBe("Your receipt");

    const search = await list(inbox.token, "?q=password");
    expect(search.data.messages.map((m) => m.subject)).toEqual(["Reset your password"]);
    const wildcard = await list(inbox.token, `?q=${encodeURIComponent("%")}`);
    expect(wildcard.data.messages).toHaveLength(0);

    const page1 = await list(inbox.token, "?limit=3");
    expect(page1.data.messages).toHaveLength(3);
    expect(page1.data.nextCursor).toBeTruthy();
    const page2 = await list(inbox.token, `?limit=3&cursor=${page1.data.nextCursor}`);
    expect(page2.data.messages.map((m) => m.subject)).toEqual(["Welcome aboard"]);
    expect(page2.data.nextCursor).toBeNull();

    const target = all.data.messages[1]!;
    await patchMessage(
      makeRequest("PATCH", `/api/messages/${target.id}`, {
        bearer: inbox.token,
        json: { read: true },
      }),
      idParams(target.id),
    );
    const unread = await list(inbox.token, "?unread=true");
    expect(unread.data.messages.map((m) => m.id)).not.toContain(target.id);
    expect(unread.data.messages).toHaveLength(3);
  });

  it("deletes a single message, updates counters and notifies subscribers", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    await deliver(inbox.address, "Disposable");
    const [message] = (await list(inbox.token)).data.messages;
    const [row] = await getDb().select().from(inboxes);
    expect(row!.messageCount).toBe(1);

    const events: unknown[] = [];
    const unsubscribe = await getRealtimeBus().subscribe(row!.id, (event) => events.push(event));
    const response = await deleteMessage(
      makeRequest("DELETE", `/api/messages/${message!.id}`, { bearer: inbox.token }),
      idParams(message!.id),
    );
    expect(response.status).toBe(200);
    const deadline = Date.now() + 2_000;
    while (events.length === 0 && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    unsubscribe();
    expect(events).toEqual([{ type: "message.deleted", messageId: message!.id }]);
    const [after] = await getDb().select().from(inboxes);
    expect(after!.messageCount).toBe(0);
    expect(await getDb().select().from(messages)).toHaveLength(0);
  });
});

describe("expiration", () => {
  it("cleanup deletes expired inboxes with their messages and attachments", async () => {
    await createReceivingDomain();
    const keep = await newInbox("203.0.113.31");
    const expire = await newInbox("203.0.113.32");
    await deliver(keep.address, "Keep me");
    await deliver(expire.address, "Expire me", {
      attachments: [{ filename: "a.txt", content: "data", contentType: "text/plain" }],
    });
    await getDb()
      .update(inboxes)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(inboxes.address, expire.address));
    const [expiring] = await getDb()
      .select()
      .from(inboxes)
      .where(eq(inboxes.address, expire.address));

    const events: unknown[] = [];
    const unsubscribe = await getRealtimeBus().subscribe(expiring!.id, (event) =>
      events.push(event),
    );
    const report = await runCleanup();
    const deadline = Date.now() + 2_000;
    while (events.length === 0 && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    unsubscribe();

    expect(report.expiredInboxes).toBe(1);
    expect(events).toEqual([{ type: "inbox.deleted", reason: "expired" }]);
    const remaining = await getDb().select().from(inboxes);
    expect(remaining.map((i) => i.address)).toEqual([keep.address]);
    expect((await getDb().select().from(messages)).map((m) => m.subject)).toEqual(["Keep me"]);
    expect(await getDb().select().from(attachments)).toHaveLength(0);

    const after = await getCurrent(
      makeRequest("GET", "/api/inboxes/current", { bearer: expire.token }),
      noParams,
    );
    expect(after.status).toBe(401);
  });

  it("does not deliver mail to an expired inbox", async () => {
    await createReceivingDomain();
    const inbox = await newInbox();
    await getDb()
      .update(inboxes)
      .set({ expiresAt: new Date(Date.now() - 1_000) });
    const raw = await buildMime({ to: inbox.address, text: "late" });
    await expect(
      acceptInbound({ provider: "webhook", raw, recipients: [inbox.address] }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
