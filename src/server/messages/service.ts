import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { attachments, inboxes, messages, type Attachment, type Message } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import { isInlineSafeImage } from "@/server/mail/attachments";
import { buildEmailDocument, renderEmailHtml } from "@/server/mail/sanitize";
import { publishInboxEvent } from "@/server/realtime/events";
import type {
  AttachmentView,
  MessageDetailView,
  MessagePage,
  MessageSummaryView,
} from "@/lib/types";

const summaryColumns = {
  publicId: messages.publicId,
  fromName: messages.fromName,
  fromAddress: messages.fromAddress,
  subject: messages.subject,
  preview: messages.preview,
  receivedAt: messages.receivedAt,
  readAt: messages.readAt,
  attachmentCount: messages.attachmentCount,
  sizeBytes: messages.sizeBytes,
};

type SummaryRow = {
  publicId: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  preview: string;
  receivedAt: Date;
  readAt: Date | null;
  attachmentCount: number;
  sizeBytes: number;
};

function toSummary(row: SummaryRow): MessageSummaryView {
  return {
    id: row.publicId,
    from: { name: row.fromName, address: row.fromAddress },
    subject: row.subject,
    preview: row.preview,
    receivedAt: row.receivedAt.toISOString(),
    read: row.readAt !== null,
    attachmentCount: row.attachmentCount,
    sizeBytes: row.sizeBytes,
  };
}

function toAttachmentView(row: Attachment): AttachmentView {
  return {
    id: row.publicId,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    inline: row.disposition === "inline",
    blocked: row.isBlocked,
    blockedReason: row.blockedReason,
  };
}

export function encodeCursor(row: { receivedAt: Date; publicId: string }): string {
  return Buffer.from(JSON.stringify([row.receivedAt.toISOString(), row.publicId])).toString(
    "base64url",
  );
}

export function decodeCursor(cursor: string): { receivedAt: Date; publicId: string } | null {
  try {
    const [iso, publicId] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [
      string,
      string,
    ];
    const receivedAt = new Date(iso);
    if (Number.isNaN(receivedAt.getTime()) || typeof publicId !== "string" || publicId.length > 64)
      return null;
    return { receivedAt, publicId };
  } catch {
    return null;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export interface ListMessagesOptions {
  limit: number;
  cursor?: string;
  query?: string;
  unreadOnly?: boolean;
}

export async function listMessages(
  inboxId: string,
  options: ListMessagesOptions,
): Promise<MessagePage> {
  const db = getDb();
  const conditions: SQL[] = [eq(messages.inboxId, inboxId)];
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    if (!cursor) throw errors.badRequest("Invalid pagination cursor.");
    conditions.push(
      sql`(${messages.receivedAt}, ${messages.publicId}) < (${cursor.receivedAt}, ${cursor.publicId})`,
    );
  }
  if (options.query) {
    const pattern = `%${escapeLike(options.query.trim())}%`;
    conditions.push(
      or(
        ilike(messages.subject, pattern),
        ilike(messages.fromAddress, pattern),
        ilike(messages.fromName, pattern),
        ilike(messages.preview, pattern),
        ilike(messages.textBody, pattern),
      )!,
    );
  }
  if (options.unreadOnly) conditions.push(isNull(messages.readAt));

  const rows = await db
    .select(summaryColumns)
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.receivedAt), desc(messages.publicId))
    .limit(options.limit + 1);

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) filter (where ${messages.readAt} is null)::int`,
    })
    .from(messages)
    .where(eq(messages.inboxId, inboxId));

  const page = rows.slice(0, options.limit);
  const last = page.at(-1);
  return {
    messages: page.map(toSummary),
    nextCursor: rows.length > options.limit && last ? encodeCursor(last) : null,
    total: counts?.total ?? 0,
    unread: counts?.unread ?? 0,
  };
}

async function findMessage(inboxId: string, publicId: string): Promise<Message> {
  if (!/^msg_[A-Za-z0-9]{10,40}$/.test(publicId)) throw errors.notFound("Message not found.");
  const [row] = await getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.publicId, publicId), eq(messages.inboxId, inboxId)))
    .limit(1);
  // Same 404 whether the message does not exist or belongs to another inbox.
  if (!row) throw errors.notFound("Message not found.");
  return row;
}

export async function getMessageDetail(
  inboxId: string,
  publicId: string,
  options: { markRead: boolean },
): Promise<MessageDetailView> {
  const db = getDb();
  const message = await findMessage(inboxId, publicId);
  if (options.markRead && !message.readAt) {
    const now = new Date();
    await db.update(messages).set({ readAt: now }).where(eq(messages.id, message.id));
    message.readAt = now;
  }
  const files = await db
    .select()
    .from(attachments)
    .where(eq(attachments.messageId, message.id))
    .orderBy(asc(attachments.createdAt));
  return {
    ...toSummary(message),
    to: message.toHeader,
    cc: message.ccHeader,
    replyTo: message.replyTo,
    envelopeTo: message.envelopeTo,
    date: message.headerDate?.toISOString() ?? null,
    text: message.textBody,
    html: message.htmlBody,
    hasHtml: Boolean(message.htmlBody),
    hasRemoteContent: message.hasRemoteContent,
    headers: message.headers,
    attachments: files.map(toAttachmentView),
  };
}

export async function setMessageRead(
  inboxId: string,
  publicId: string,
  read: boolean,
): Promise<void> {
  const message = await findMessage(inboxId, publicId);
  await getDb()
    .update(messages)
    .set({ readAt: read ? (message.readAt ?? new Date()) : null })
    .where(eq(messages.id, message.id));
}

export async function deleteMessage(inboxId: string, publicId: string): Promise<void> {
  const message = await findMessage(inboxId, publicId);
  await getDb().transaction(async (tx) => {
    const removed = await tx
      .delete(messages)
      .where(eq(messages.id, message.id))
      .returning({ id: messages.id });
    if (removed.length === 0) return;
    await tx
      .update(inboxes)
      .set({ messageCount: sql`greatest(${inboxes.messageCount} - 1, 0)` })
      .where(eq(inboxes.id, inboxId));
    await publishInboxEvent(inboxId, { type: "message.deleted", messageId: publicId }, tx);
  });
}

const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

/** Full HTML document for the sandboxed reader iframe. */
export async function renderMessageDocument(
  inboxId: string,
  publicId: string,
  options: { allowRemoteImages: boolean },
): Promise<string> {
  const message = await findMessage(inboxId, publicId);
  if (!message.htmlBody) {
    return buildEmailDocument('<p style="color:#64748b">This message has no HTML version.</p>');
  }
  const inlineImages = new Map<string, string>();
  const inline = await getDb()
    .select()
    .from(attachments)
    .where(and(eq(attachments.messageId, message.id), eq(attachments.isBlocked, false)));
  let budget = MAX_INLINE_IMAGE_BYTES;
  for (const file of inline) {
    if (!file.contentId || !file.content || !isInlineSafeImage(file.contentType)) continue;
    if (file.sizeBytes > budget) continue;
    budget -= file.sizeBytes;
    inlineImages.set(
      file.contentId,
      `data:${file.contentType};base64,${file.content.toString("base64")}`,
    );
  }
  const body = renderEmailHtml(message.htmlBody, {
    allowRemoteImages: options.allowRemoteImages,
    inlineImages,
  });
  return buildEmailDocument(body);
}

export async function getAttachmentContent(
  inboxId: string,
  messagePublicId: string,
  attachmentPublicId: string,
): Promise<Attachment> {
  const message = await findMessage(inboxId, messagePublicId);
  const [file] = await getDb()
    .select()
    .from(attachments)
    .where(and(eq(attachments.publicId, attachmentPublicId), eq(attachments.messageId, message.id)))
    .limit(1);
  if (!file) throw errors.notFound("Attachment not found.");
  if (file.isBlocked || !file.content) {
    throw errors.forbidden(file.blockedReason ?? "This attachment is not available for download.");
  }
  return file;
}
