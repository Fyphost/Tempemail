import { and, eq, gt, lt, sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import {
  attachments,
  inboxes,
  messages,
  type IngestJob,
  type IngestResult,
} from "@/server/db/schema";
import { markDomainReceiveVerified } from "@/server/domains/service";
import { PermanentJobError } from "@/server/jobs/queue";
import { publishInboxEvent } from "@/server/realtime/events";
import { publicIds, sha256Hex } from "@/server/security/crypto";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getSettings, limitsFor } from "@/server/settings";
import { incrementStat } from "@/server/stats";

import { parseEmail, type ParsedEmail } from "./parse";
import { resolveRecipient } from "./recipients";

type StoreOutcome = "delivered" | "duplicate" | "mailbox_full" | "inbox_expired";

async function storeMessage(
  job: IngestJob,
  inboxId: string,
  recipient: string,
  parsed: ParsedEmail,
  dedupeHash: string,
  maxMessages: number,
): Promise<StoreOutcome> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Reserve a slot atomically so concurrent deliveries cannot exceed the cap.
    const [slot] = await tx
      .update(inboxes)
      .set({ messageCount: sql`${inboxes.messageCount} + 1` })
      .where(
        and(
          eq(inboxes.id, inboxId),
          lt(inboxes.messageCount, maxMessages),
          gt(inboxes.expiresAt, new Date()),
        ),
      )
      .returning({ id: inboxes.id });
    if (!slot) {
      const [inbox] = await tx
        .select({ expiresAt: inboxes.expiresAt })
        .from(inboxes)
        .where(eq(inboxes.id, inboxId))
        .limit(1);
      return !inbox || inbox.expiresAt.getTime() <= Date.now() ? "inbox_expired" : "mailbox_full";
    }

    const [message] = await tx
      .insert(messages)
      .values({
        publicId: publicIds.message(),
        inboxId,
        ingestJobId: job.id,
        dedupeHash,
        fromName: parsed.fromName,
        fromAddress: parsed.fromAddress,
        replyTo: parsed.replyTo,
        toHeader: parsed.to,
        ccHeader: parsed.cc,
        envelopeFrom: job.envelopeFrom,
        envelopeTo: recipient,
        subject: parsed.subject,
        textBody: parsed.text,
        htmlBody: parsed.html,
        preview: parsed.preview,
        hasRemoteContent: parsed.hasRemoteContent,
        sizeBytes: job.rawSize,
        attachmentCount: parsed.attachments.filter((file) => file.disposition === "attachment")
          .length,
        headerDate: parsed.date,
        messageIdHeader: parsed.messageId,
        headers: parsed.headers,
      })
      .onConflictDoNothing({ target: [messages.inboxId, messages.dedupeHash] })
      .returning({ id: messages.id, publicId: messages.publicId });

    if (!message) {
      await tx
        .update(inboxes)
        .set({ messageCount: sql`greatest(${inboxes.messageCount} - 1, 0)` })
        .where(eq(inboxes.id, inboxId));
      return "duplicate";
    }

    if (parsed.attachments.length > 0) {
      await tx.insert(attachments).values(
        parsed.attachments.map((file) => ({
          publicId: publicIds.attachment(),
          messageId: message.id,
          filename: file.filename,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          contentId: file.contentId,
          disposition: file.disposition,
          isBlocked: file.blocked,
          blockedReason: file.blockedReason,
          sha256: file.sha256,
          content: file.content,
        })),
      );
    }

    await publishInboxEvent(inboxId, { type: "message.received", messageId: message.publicId }, tx);
    return "delivered";
  });
}

/** Parse a queued raw message and deliver it to every matching live inbox. */
export async function processIngestJob(job: IngestJob): Promise<IngestResult> {
  if (!job.raw) throw new PermanentJobError("The raw message payload is no longer available.");
  const settings = await getSettings();
  const policy = {
    maxAttachmentBytes: settings.attachments.maxAttachmentSizeKb * 1024,
    blockedExtensions: settings.attachments.blockedExtensions,
  };
  const dedupeHash = sha256Hex(job.raw);
  const result: IngestResult = { delivered: 0, duplicates: 0, probes: [], rejected: [] };
  let parsed: ParsedEmail | null = null;
  const seenInboxes = new Set<string>();

  for (const recipient of job.recipients) {
    const target = await resolveRecipient(recipient);
    if (!target) {
      result.rejected!.push({ recipient, reason: "unknown_recipient" });
      continue;
    }
    if (target.kind === "probe") {
      await markDomainReceiveVerified(target.domainId);
      result.probes!.push(recipient);
      continue;
    }
    if (seenInboxes.has(target.inboxId)) continue;
    seenInboxes.add(target.inboxId);

    const limits = limitsFor(target.plan, settings);
    if (job.rawSize > limits.maxMessageSizeKb * 1024) {
      result.rejected!.push({ recipient, reason: "too_large" });
      continue;
    }
    const rate = await consumeRateLimit(
      "inbound.inbox",
      target.inboxId,
      settings.rateLimits.inboundPerInboxPerMinute,
      60,
    );
    if (!rate.allowed) {
      result.rejected!.push({ recipient, reason: "rate_limited" });
      continue;
    }

    if (!parsed) {
      try {
        parsed = await parseEmail(job.raw, policy);
      } catch (error) {
        throw new PermanentJobError(
          `Could not parse message: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const outcome = await storeMessage(
      job,
      target.inboxId,
      recipient,
      parsed,
      dedupeHash,
      limits.maxMessagesPerInbox,
    );
    if (outcome === "delivered") result.delivered += 1;
    else if (outcome === "duplicate") result.duplicates! += 1;
    else result.rejected!.push({ recipient, reason: outcome });
  }

  await incrementStat("messagesReceived", result.delivered);
  await incrementStat("messagesRejected", result.rejected!.length);
  return result;
}

/** A job is "completed" when anything was delivered or verified; otherwise "rejected". */
export function jobStatusFor(result: IngestResult): "completed" | "rejected" {
  const handled = result.delivered + (result.duplicates ?? 0) + (result.probes?.length ?? 0);
  return handled > 0 ? "completed" : "rejected";
}
