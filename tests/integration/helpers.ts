import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";

import { SYSTEM_ACTOR } from "@/server/audit";
import { getDb } from "@/server/db/client";
import { domains, type Domain } from "@/server/db/schema";
import { createDomain, invalidateDomainCache } from "@/server/domains/service";
import { computeInboundSignature } from "@/server/mail/providers/signatures";
import { sha256Hex } from "@/server/security/crypto";
import { DEFAULT_SETTINGS, saveSettings, type SystemSettings } from "@/server/settings";

export const ORIGIN = "http://localhost:3000";

/** A domain that has passed MX and end-to-end receive verification. */
export async function createReceivingDomain(
  name = "inbox.test",
  options: { visibility?: "public" | "premium" } = {},
): Promise<Domain> {
  const domain = await createDomain({ name, visibility: options.visibility }, SYSTEM_ACTOR);
  const [updated] = await getDb()
    .update(domains)
    .set({
      isEnabled: true,
      mxStatus: "verified",
      receiveStatus: "verified",
      receiveVerifiedAt: new Date(),
    })
    .where(eq(domains.id, domain.id))
    .returning();
  invalidateDomainCache();
  return updated!;
}

export async function updateSettings(mutate: (settings: SystemSettings) => void): Promise<void> {
  const next = structuredClone(DEFAULT_SETTINGS);
  mutate(next);
  await saveSettings(next, null);
}

export interface RequestOptions {
  json?: unknown;
  body?: BodyInit;
  cookie?: string;
  bearer?: string;
  headers?: Record<string, string>;
  ip?: string;
  origin?: string | null;
}

export function makeRequest(
  method: string,
  path: string,
  options: RequestOptions = {},
): NextRequest {
  const headers = new Headers(options.headers);
  headers.set("x-forwarded-for", options.ip ?? "203.0.113.10");
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  if (options.origin !== null && method !== "GET") headers.set("origin", options.origin ?? ORIGIN);
  let body = options.body;
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body });
}

export const noParams = { params: Promise.resolve({}) };
export const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

export async function readJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Turn a Set-Cookie response into a Cookie request header value. */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0]!)
    .join("; ");
}

export interface MailInput {
  from?: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
    cid?: string;
  }[];
  headers?: Record<string, string>;
}

/** Build a real RFC 5322 message with nodemailer's MIME composer. */
export async function buildMime(input: MailInput): Promise<Buffer> {
  const composer = new MailComposer({
    from: input.from ?? '"Acme Notifications" <noreply@acme.example>',
    to: input.to,
    subject: input.subject ?? "Your verification code",
    text: input.text,
    html: input.html,
    attachments: input.attachments,
    headers: input.headers,
  });
  return new Promise((resolve, reject) => {
    composer.compile().build((error, message) => (error ? reject(error) : resolve(message)));
  });
}

export async function sendSmtp(
  port: number,
  envelope: { from: string; to: string[] },
  raw: Buffer,
) {
  const transport = nodemailer.createTransport({
    host: "127.0.0.1",
    port,
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 5_000,
  });
  try {
    return await transport.sendMail({ envelope, raw });
  } finally {
    transport.close();
  }
}

export function signedInboundHeaders(
  raw: Buffer,
  recipients: string,
  sender = "bounce@acme.example",
  secret = process.env.INBOUND_WEBHOOK_SECRET!,
  timestamp = String(Math.floor(Date.now() / 1000)),
): Record<string, string> {
  const signature = computeInboundSignature(secret, {
    timestamp,
    recipients,
    sender,
    bodySha256: sha256Hex(raw),
  });
  return {
    "content-type": "message/rfc822",
    "x-tempemail-timestamp": timestamp,
    "x-tempemail-recipients": recipients,
    "x-tempemail-sender": sender,
    "x-tempemail-signature": `v1=${signature}`,
  };
}

/** Read Server-Sent Event frames from a streaming response until `predicate` matches. */
export async function readSseUntil(
  response: Response,
  predicate: (event: { event: string; data: unknown }) => boolean,
  timeoutMs = 5_000,
): Promise<{ event: string; data: unknown }[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: { event: string; data: unknown }[] = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(
            () => resolve({ done: true, value: undefined }),
            Math.max(1, deadline - Date.now()),
          ),
        ),
      ]);
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const name = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (!name) continue;
        const parsed = { event: name, data: data ? JSON.parse(data) : null };
        events.push(parsed);
        if (predicate(parsed)) return events;
      }
    }
    return events;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
