import type { IngestProvider } from "@/server/db/schema";
import { ApiError } from "@/server/http/errors";
import { enqueueIngestJob } from "@/server/jobs/queue";
import { getSettings } from "@/server/settings";

import { parseAddress } from "./address";
import { resolveRecipient } from "./recipients";

export const MAX_RECIPIENTS_PER_MESSAGE = 50;

/** Largest message any plan accepts; transport-level limits use this value. */
export async function absoluteMaxMessageBytes(): Promise<number> {
  const settings = await getSettings();
  const kb = Math.max(
    settings.plans.free.maxMessageSizeKb,
    settings.plans.premium.maxMessageSizeKb,
  );
  return kb * 1024;
}

export interface InboundInput {
  provider: IngestProvider;
  raw: Buffer;
  recipients: string[];
  envelopeFrom?: string | null;
  remoteIpHash?: string | null;
}

export interface InboundOutcome {
  jobId: string;
  duplicate: boolean;
  accepted: string[];
  rejected: string[];
}

/**
 * Shared entry point for every inbound provider (webhooks and SMTP).
 * Unknown recipients are rejected before anything is stored.
 */
export async function acceptInbound(input: InboundInput): Promise<InboundOutcome> {
  if (input.raw.length === 0) throw new ApiError(400, "empty_message", "The message is empty.");
  if (input.raw.length > (await absoluteMaxMessageBytes())) {
    throw new ApiError(413, "message_too_large", "The message exceeds the maximum accepted size.");
  }
  const normalized = [
    ...new Set(
      input.recipients
        .map((recipient) => parseAddress(recipient)?.address)
        .filter((recipient): recipient is string => Boolean(recipient)),
    ),
  ];
  if (normalized.length === 0)
    throw new ApiError(400, "no_recipient", "No valid envelope recipient was provided.");
  if (normalized.length > MAX_RECIPIENTS_PER_MESSAGE) {
    throw new ApiError(400, "too_many_recipients", "Too many recipients.");
  }

  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const recipient of normalized) {
    if (await resolveRecipient(recipient)) accepted.push(recipient);
    else rejected.push(recipient);
  }
  if (accepted.length === 0) {
    throw new ApiError(
      404,
      "unknown_recipient",
      "No active inbox exists for the recipient address.",
    );
  }

  const { jobId, duplicate } = await enqueueIngestJob({
    provider: input.provider,
    raw: input.raw,
    recipients: accepted,
    envelopeFrom: input.envelopeFrom ?? null,
    remoteIpHash: input.remoteIpHash ?? null,
  });
  return { jobId, duplicate, accepted, rejected };
}
