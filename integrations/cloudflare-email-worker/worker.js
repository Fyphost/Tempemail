/**
 * Cloudflare Email Worker for Tempemail.
 *
 * Cloudflare Email Routing hands every message for your domain to this
 * Worker. The Worker forwards the raw message to Tempemail's signed inbound
 * webhook and rejects mail for unknown addresses at the edge, so nothing is
 * stored for them and no bounce is generated.
 *
 * Required settings (wrangler.toml / dashboard):
 *   INBOUND_URL             https://<your-app>/api/webhooks/inbound
 *   INBOUND_WEBHOOK_SECRET  same value as the app's INBOUND_WEBHOOK_SECRET (store as a secret)
 *   MAX_BYTES               optional, defaults to 26214400 (25 MB)
 */

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readRaw(stream, maxBytes) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const raw = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return raw;
}

async function sign(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export default {
  async email(message, env) {
    const maxBytes = Number(env.MAX_BYTES || 26214400);
    if (message.rawSize > maxBytes) {
      message.setReject("Message too large");
      return;
    }
    const raw = await readRaw(message.raw, maxBytes);
    if (!raw) {
      message.setReject("Message too large");
      return;
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const recipients = message.to;
    const sender = message.from || "";
    const bodySha256 = toHex(await crypto.subtle.digest("SHA-256", raw));
    const signature = await sign(
      env.INBOUND_WEBHOOK_SECRET,
      `${timestamp}\n${recipients}\n${sender}\n${bodySha256}`,
    );

    const response = await fetch(env.INBOUND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "message/rfc822",
        "X-Tempemail-Timestamp": timestamp,
        "X-Tempemail-Recipients": recipients,
        "X-Tempemail-Sender": sender,
        "X-Tempemail-Signature": `v1=${signature}`,
      },
      body: raw,
    });

    if (response.status === 404) {
      message.setReject("Mailbox unavailable");
      return;
    }
    if (response.status === 413) {
      message.setReject("Message too large");
      return;
    }
    if (!response.ok) {
      // Throwing makes Cloudflare report a temporary failure, so the sender retries later.
      throw new Error(`Tempemail ingestion failed with HTTP ${response.status}`);
    }
  },
};
