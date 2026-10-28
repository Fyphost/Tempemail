import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import type { StoredHeader } from "@/server/db/schema";
import { sha256Hex } from "@/server/security/crypto";

import { evaluateAttachment, sanitizeFilename } from "./attachments";
import { makePreview, sanitizeEmailHtml } from "./sanitize";

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
  disposition: "attachment" | "inline";
  sha256: string;
  blocked: boolean;
  blockedReason: string | null;
  content: Buffer | null;
}

export interface ParsedEmail {
  fromName: string;
  fromAddress: string;
  replyTo: string | null;
  to: string | null;
  cc: string | null;
  subject: string;
  text: string | null;
  html: string | null;
  hasRemoteContent: boolean;
  preview: string;
  date: Date | null;
  messageId: string | null;
  headers: StoredHeader[];
  attachments: ParsedAttachment[];
}

const KEPT_HEADERS = new Set([
  "date",
  "from",
  "sender",
  "reply-to",
  "to",
  "cc",
  "subject",
  "message-id",
  "in-reply-to",
  "return-path",
  "authentication-results",
  "received-spf",
  "dkim-signature",
  "arc-authentication-results",
  "list-unsubscribe",
  "list-id",
  "x-mailer",
  "user-agent",
  "mime-version",
  "content-type",
  "auto-submitted",
  "precedence",
]);

const MAX_TEXT_CHARS = 1_000_000;
const MAX_HTML_CHARS = 3_000_000;

function addressText(value: AddressObject | AddressObject[] | undefined): string | null {
  if (!value) return null;
  const list = Array.isArray(value) ? value : [value];
  const text = list
    .map((item) => item.text)
    .filter(Boolean)
    .join(", ")
    .trim();
  return text.length > 0 ? text.slice(0, 2_000) : null;
}

function firstMailbox(value: AddressObject | undefined): { name: string; address: string } {
  for (const entry of value?.value ?? []) {
    if (entry.address) return { name: entry.name ?? "", address: entry.address.toLowerCase() };
    for (const member of entry.group ?? []) {
      if (member.address) return { name: member.name ?? "", address: member.address.toLowerCase() };
    }
  }
  return { name: "", address: "" };
}

function selectHeaders(parsed: ParsedMail): StoredHeader[] {
  const kept: StoredHeader[] = [];
  for (const line of parsed.headerLines) {
    const key = line.key.toLowerCase();
    if (!KEPT_HEADERS.has(key)) continue;
    const colon = line.line.indexOf(":");
    const name = colon > 0 ? line.line.slice(0, colon).trim() : line.key;
    let value = colon > 0 ? line.line.slice(colon + 1) : "";
    value = value.replace(/\r?\n[ \t]+/g, " ").trim();
    if (key === "dkim-signature") {
      // Keep only the signing domain/selector, not the signature blob.
      const domain = /\bd=([^;\s]+)/i.exec(value)?.[1];
      const selector = /\bs=([^;\s]+)/i.exec(value)?.[1];
      value = [domain && `d=${domain}`, selector && `s=${selector}`].filter(Boolean).join("; ");
    }
    kept.push([name.slice(0, 100), value.slice(0, 1_000)]);
    if (kept.length >= 40) break;
  }
  return kept;
}

function cleanSubject(subject: string | undefined): string {
  return (subject ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, 998);
}

export async function parseEmail(
  raw: Buffer,
  policy: { maxAttachmentBytes: number; blockedExtensions: readonly string[] },
): Promise<ParsedEmail> {
  const parsed = await simpleParser(raw, {
    keepCidLinks: true,
    skipTextToHtml: true,
    skipImageLinks: true,
    maxHtmlLengthToParse: MAX_HTML_CHARS,
  });

  const from = firstMailbox(parsed.from);
  const rawHtml = typeof parsed.html === "string" ? parsed.html.slice(0, MAX_HTML_CHARS) : "";
  const sanitized = rawHtml ? sanitizeEmailHtml(rawHtml) : { html: "", hasRemoteContent: false };
  const text = parsed.text ? parsed.text.slice(0, MAX_TEXT_CHARS) : null;

  const attachments: ParsedAttachment[] = parsed.attachments.map((attachment, index) => {
    const contentType = (attachment.contentType || "application/octet-stream").toLowerCase();
    const filename = sanitizeFilename(attachment.filename, `attachment-${index + 1}`);
    const decision = evaluateAttachment(filename, contentType, attachment.size, policy);
    const isInline =
      attachment.contentDisposition === "inline" || Boolean(attachment.related && attachment.cid);
    return {
      filename,
      contentType: contentType.slice(0, 255),
      sizeBytes: attachment.size,
      contentId: attachment.cid ? attachment.cid.toLowerCase().slice(0, 255) : null,
      disposition: isInline ? "inline" : "attachment",
      sha256: sha256Hex(attachment.content),
      blocked: decision.blocked,
      blockedReason: decision.reason,
      content: decision.blocked ? null : attachment.content,
    };
  });

  return {
    fromName: (from.name || "").slice(0, 300),
    fromAddress: from.address.slice(0, 320),
    replyTo: addressText(parsed.replyTo),
    to: addressText(parsed.to),
    cc: addressText(parsed.cc),
    subject: cleanSubject(parsed.subject),
    text,
    html: sanitized.html.length > 0 ? sanitized.html : null,
    hasRemoteContent: sanitized.hasRemoteContent,
    preview: makePreview(text),
    date: parsed.date && !Number.isNaN(parsed.date.getTime()) ? parsed.date : null,
    messageId: parsed.messageId ? parsed.messageId.slice(0, 998) : null,
    headers: selectHeaders(parsed),
    attachments,
  };
}
