import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyInboundSignature } from "@/server/mail/providers/signatures";
import { sha256Hex } from "@/server/security/crypto";

// The Worker is plain JavaScript deployed to Cloudflare; test it against the server's verifier.
import worker from "../../integrations/cloudflare-email-worker/worker.js";

const SECRET = "shared-secret-for-tests";
const env = {
  INBOUND_URL: "https://app.example/api/webhooks/inbound",
  INBOUND_WEBHOOK_SECRET: SECRET,
};

function message(raw: string, to = "kavitore4821@mail.example.com") {
  const bytes = new TextEncoder().encode(raw);
  return {
    from: "sender@outside.example",
    to,
    rawSize: bytes.byteLength,
    raw: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    setReject: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cloudflare Email Worker", () => {
  it("signs requests in the format the inbound webhook verifies", async () => {
    let captured: { url: string; headers: Headers; body: Uint8Array } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        captured = { url, headers: new Headers(init.headers), body: init.body as Uint8Array };
        return new Response("{}", { status: 202 });
      }),
    );
    const mail = message("Subject: hi\r\n\r\nhello");
    await worker.email(mail, env);

    expect(mail.setReject).not.toHaveBeenCalled();
    expect(captured).not.toBeNull();
    const request = captured!;
    expect(request.url).toBe(env.INBOUND_URL);
    expect(request.headers.get("content-type")).toBe("message/rfc822");
    const valid = verifyInboundSignature(
      SECRET,
      request.headers.get("x-tempemail-signature"),
      {
        timestamp: request.headers.get("x-tempemail-timestamp")!,
        recipients: request.headers.get("x-tempemail-recipients")!,
        sender: request.headers.get("x-tempemail-sender")!,
        bodySha256: sha256Hex(Buffer.from(request.body)),
      },
      300,
    );
    expect(valid).toBe(true);
  });

  it("rejects unknown recipients and oversized mail at the edge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    const unknown = message("Subject: x\r\n\r\ny");
    await worker.email(unknown, env);
    expect(unknown.setReject).toHaveBeenCalledWith("Mailbox unavailable");

    const big = message("x".repeat(2048));
    await worker.email(big, { ...env, MAX_BYTES: "1024" });
    expect(big.setReject).toHaveBeenCalledWith("Message too large");
  });

  it("throws on server errors so the sender retries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    await expect(worker.email(message("Subject: x\r\n\r\ny"), env)).rejects.toThrow(/503/);
  });
});
