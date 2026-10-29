import { eq } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { webhookNonces } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { ApiError, errors } from "@/server/http/errors";
import { readBodyLimited } from "@/server/http/request";
import { errorResponse, ok } from "@/server/http/respond";
import { apiRoute } from "@/server/http/route";
import { recordWebhookFailure } from "@/server/jobs/queue";
import { parseRecipientList } from "@/server/mail/address";
import { absoluteMaxMessageBytes, acceptInbound } from "@/server/mail/inbound";
import { verifyMailgunSignature } from "@/server/mail/providers/signatures";

export const dynamic = "force-dynamic";

function field(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
}

/**
 * Mailgun inbound route target. Configure the route action as
 * forward("https://<app>/api/webhooks/mailgun/mime") — Mailgun only posts the
 * raw MIME (`body-mime`) when the URL ends in "mime".
 */
export const POST = apiRoute(
  async (request, _context, { ipHash }) => {
    const env = getEnv();
    const signingKey = env.MAILGUN_WEBHOOK_SIGNING_KEY;
    if (!signingKey) {
      await recordWebhookFailure("mailgun", "provider_not_configured", 404, ipHash);
      throw errors.notFound("Mailgun ingestion is not configured.");
    }

    // URL-encoded MIME can expand up to ~3x.
    const limit = (await absoluteMaxMessageBytes()) * 3 + 1024 * 1024;
    let form: FormData;
    try {
      const body = await readBodyLimited(request, limit);
      form = await new Response(new Uint8Array(body), {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch (error) {
      const reason = error instanceof ApiError ? error.code : "invalid_form_body";
      await recordWebhookFailure(
        "mailgun",
        reason,
        error instanceof ApiError ? error.status : 400,
        ipHash,
      );
      if (error instanceof ApiError) throw error;
      throw errors.badRequest("Expected a form-encoded Mailgun payload.");
    }

    const token = field(form, "token");
    const valid = verifyMailgunSignature(
      { timestamp: field(form, "timestamp"), token, signature: field(form, "signature") },
      signingKey,
      env.WEBHOOK_MAX_SKEW_SECONDS,
    );
    if (!valid || !token) {
      await recordWebhookFailure("mailgun", "invalid_signature", 401, ipHash);
      throw errors.unauthorized("Invalid or expired webhook signature.");
    }

    const db = getDb();
    const nonce = `mailgun:${token}`;
    const [seen] = await db
      .select()
      .from(webhookNonces)
      .where(eq(webhookNonces.nonce, nonce))
      .limit(1);
    if (seen) return ok({ status: "duplicate" });

    const mime = field(form, "body-mime");
    if (!mime) {
      await recordWebhookFailure("mailgun", "missing_body_mime", 400, ipHash);
      throw errors.badRequest('Missing "body-mime". The Mailgun route URL must end in "/mime".');
    }

    try {
      const outcome = await acceptInbound({
        provider: "mailgun",
        raw: Buffer.from(mime, "utf8"),
        recipients: parseRecipientList(field(form, "recipient")),
        envelopeFrom: field(form, "sender"),
        remoteIpHash: ipHash,
      });
      await db.insert(webhookNonces).values({ nonce }).onConflictDoNothing();
      return ok({
        status: outcome.duplicate ? "duplicate" : "queued",
        accepted: outcome.accepted.length,
      });
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 413 || error.status === 400)
      ) {
        await recordWebhookFailure("mailgun", error.code, error.status, ipHash);
        // 406 tells Mailgun not to retry a message we will never accept.
        const response = errorResponse(error);
        return new Response(response.body, { status: 406, headers: response.headers });
      }
      throw error;
    }
  },
  { skipRateLimit: true },
);
