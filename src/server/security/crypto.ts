import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Uniformly random base62 string (rejection-free via randomInt). */
export function randomBase62(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += BASE62[randomInt(0, BASE62.length)];
  }
  return out;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(key: string | Buffer, input: string | Buffer): string {
  return createHmac("sha256", key).update(input).digest("hex");
}

/** Constant-time comparison of two hex/ASCII strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // Still spend comparable time so length is not trivially observable.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Public identifiers exposed in URLs/APIs. Never derived from internal UUIDs. */
export const publicIds = {
  inbox: () => `inb_${randomBase62(20)}`,
  message: () => `msg_${randomBase62(20)}`,
  attachment: () => `att_${randomBase62(20)}`,
  apiKey: () => `key_${randomBase62(16)}`,
};

/** Bearer secrets. The prefix makes leaked tokens easy to recognise in secret scanners. */
export const secrets = {
  inboxToken: () => `tei_${randomToken(32)}`,
  apiKey: () => `tek_${randomToken(32)}`,
  userSession: () => randomToken(32),
};
