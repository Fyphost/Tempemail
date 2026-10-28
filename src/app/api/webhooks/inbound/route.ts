import { getEnv } from "@/server/env";
import { ApiError, errors } from "@/server/http/errors";
import { readBodyLimited } from "@/server/http/request";
import { ok } from "@/server/http/respond";
import { apiRoute } from "@/server/http/route";
import { recordWebhookFailure } from "@/server/jobs/queue";
import { parseRecipientList } from "@/server/mail/address";
import { absoluteMaxMessageBytes, acceptInbound } from "@/server/mail/inbound";
import { verifyInboundSignature } from "@/server/mail/providers/signatures";
import { sha256Hex } from "@/server/security/crypto";

export const dynamic = "force-dynamic";

/**
 * Generic signed raw-MIME ingestion, used by the bundled Cloudflare Email
 * Worker and by custom relays (for example a Postfix pipe transport).
 *
 *   POST /api/webhooks/inbound
 *   Content-Type: message/rfc822
 *   X-Tempemail-Timestamp: <unix seconds>
 *   X-Tempemail-Recipients: <envelope recipients, comma separated>
 *   X-Tempemail-Sender: <envelope sender, may be empty>
 *   X-Tempemail-Signature: v1=<hex HMAC-SHA256(secret, ts\nrecipients\nsender\nsha256(body))>
 */
export const POST = apiRoute(
  async (request, _context, { ipHash }) => {
    const env = getEnv();
    const secret = env.INBOUND_WEBHOOK_SECRET;
    if (!secret) {
      await recordWebhookFailure("webhook", "provider_not_configured", 404, ipHash);
      throw errors.notFound("Signed webhook ingestion is not configured.");
    }

    let body: Buffer;
    try {
      body = await readBodyLimited(request, (await absoluteMaxMessageBytes()) + 64 * 1024);
    } catch (error) {
      if (error instanceof ApiError)
        await recordWebhookFailure("webhook", error.code, error.status, ipHash);
      throw error;
    }

    const timestamp = request.headers.get("x-tempemail-timestamp") ?? "";
    const recipients = request.headers.get("x-tempemail-recipients") ?? "";
    const sender = request.headers.get("x-tempemail-sender") ?? "";
    const valid = verifyInboundSignature(
      secret,
      request.headers.get("x-tempemail-signature"),
      { timestamp, recipients, sender, bodySha256: sha256Hex(body) },
      env.WEBHOOK_MAX_SKEW_SECONDS,
    );
    if (!valid) {
      await recordWebhookFailure("webhook", "invalid_signature", 401, ipHash);
      throw errors.unauthorized("Invalid or expired webhook signature.");
    }

    try {
      const outcome = await acceptInbound({
        provider: "webhook",
        raw: body,
        recipients: parseRecipientList(recipients),
        envelopeFrom: sender || null,
        remoteIpHash: ipHash,
      });
      return ok(
        {
          status: outcome.duplicate ? "duplicate" : "queued",
          accepted: outcome.accepted,
          rejected: outcome.rejected,
        },
        { status: 202 },
      );
    } catch (error) {
      if (error instanceof ApiError)
        await recordWebhookFailure("webhook", error.code, error.status, ipHash);
      throw error;
    }
  },
  { skipRateLimit: true },
);
