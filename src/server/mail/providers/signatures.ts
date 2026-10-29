import { hmacSha256Hex, safeEqual } from "@/server/security/crypto";

function withinSkew(timestamp: string, maxSkewSeconds: number, nowMs: number): boolean {
  if (!/^\d{9,11}$/.test(timestamp)) return false;
  return Math.abs(nowMs / 1000 - Number(timestamp)) <= maxSkewSeconds;
}

/**
 * Mailgun signs inbound route posts with HMAC-SHA256(signingKey, timestamp + token).
 * The signature does not cover the body, so callers must also reject reused tokens.
 */
export function verifyMailgunSignature(
  fields: { timestamp?: string | null; token?: string | null; signature?: string | null },
  signingKey: string,
  maxSkewSeconds: number,
  nowMs = Date.now(),
): boolean {
  const { timestamp, token, signature } = fields;
  if (!timestamp || !token || !signature) return false;
  if (token.length < 20 || token.length > 200) return false;
  if (!withinSkew(timestamp, maxSkewSeconds, nowMs)) return false;
  const expected = hmacSha256Hex(signingKey, `${timestamp}${token}`);
  return safeEqual(expected, signature.trim().toLowerCase());
}

export interface InboundSignatureInput {
  timestamp: string;
  recipients: string;
  sender: string;
  bodySha256: string;
}

/** Canonical string signed by the generic inbound webhook (e.g. Cloudflare Email Workers). */
export function inboundSignaturePayload(input: InboundSignatureInput): string {
  return `${input.timestamp}\n${input.recipients}\n${input.sender}\n${input.bodySha256}`;
}

export function computeInboundSignature(secret: string, input: InboundSignatureInput): string {
  return hmacSha256Hex(secret, inboundSignaturePayload(input));
}

export function verifyInboundSignature(
  secret: string,
  header: string | null,
  input: InboundSignatureInput,
  maxSkewSeconds: number,
  nowMs = Date.now(),
): boolean {
  if (!header) return false;
  if (!withinSkew(input.timestamp, maxSkewSeconds, nowMs)) return false;
  const provided = header
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("v1="))
    ?.slice(3);
  if (!provided || !/^[0-9a-f]{64}$/i.test(provided)) return false;
  return safeEqual(computeInboundSignature(secret, input), provided.toLowerCase());
}
