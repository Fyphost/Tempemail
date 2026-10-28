import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export type UserRole = "user" | "admin";
export type PlanId = "free" | "premium";
export type UserStatus = "active" | "disabled";

/** UserAccount: optional registered accounts and administrators. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<UserRole>().notNull().default("user"),
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  status: text("status").$type<UserStatus>().notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastLoginAt: ts("last_login_at"),
});

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("user_sessions_user_idx").on(table.userId),
    index("user_sessions_expires_idx").on(table.expiresAt),
  ],
);

export type MxStatus = "unknown" | "verified" | "mismatch" | "missing" | "error";
export type ReceiveStatus = "pending" | "verified";
export type DomainVisibility = "public" | "premium";

/** DomainConfiguration: receiving domains and their verification state. */
export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  visibility: text("visibility").$type<DomainVisibility>().notNull().default("public"),
  expectedMx: jsonb("expected_mx")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  mxStatus: text("mx_status").$type<MxStatus>().notNull().default("unknown"),
  mxRecords: jsonb("mx_records")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  mxError: text("mx_error"),
  mxCheckedAt: ts("mx_checked_at"),
  receiveStatus: text("receive_status").$type<ReceiveStatus>().notNull().default("pending"),
  probeLocalPart: text("probe_local_part").notNull(),
  receiveVerifiedAt: ts("receive_verified_at"),
  defaultTtlMinutes: integer("default_ttl_minutes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** TemporaryInbox: a disposable address. Access is granted only through inbox tokens. */
export const inboxes = pgTable(
  "inboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id").notNull().unique(),
    localPart: text("local_part").notNull(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    address: text("address").notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan").$type<PlanId>().notNull().default("free"),
    createdIpHash: text("created_ip_hash"),
    messageCount: integer("message_count").notNull().default(0),
    extendedCount: integer("extended_count").notNull().default(0),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    maxExpiresAt: ts("max_expires_at").notNull(),
  },
  (table) => [
    index("inboxes_expires_idx").on(table.expiresAt),
    index("inboxes_user_idx").on(table.userId),
    index("inboxes_created_idx").on(table.createdAt),
    index("inboxes_ip_idx").on(table.createdIpHash),
  ],
);

export const inboxTokens = pgTable(
  "inbox_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    lastUsedAt: ts("last_used_at"),
  },
  (table) => [index("inbox_tokens_inbox_idx").on(table.inboxId)],
);

export type StoredHeader = [name: string, value: string];

/** EmailMessage: a received message, already sanitized for display. */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id").notNull().unique(),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    ingestJobId: uuid("ingest_job_id"),
    dedupeHash: text("dedupe_hash").notNull(),
    fromName: text("from_name").notNull().default(""),
    fromAddress: text("from_address").notNull().default(""),
    replyTo: text("reply_to"),
    toHeader: text("to_header"),
    ccHeader: text("cc_header"),
    envelopeFrom: text("envelope_from"),
    envelopeTo: text("envelope_to").notNull(),
    subject: text("subject").notNull().default(""),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    preview: text("preview").notNull().default(""),
    hasRemoteContent: boolean("has_remote_content").notNull().default(false),
    sizeBytes: integer("size_bytes").notNull(),
    attachmentCount: integer("attachment_count").notNull().default(0),
    headerDate: ts("header_date"),
    messageIdHeader: text("message_id_header"),
    headers: jsonb("headers")
      .$type<StoredHeader[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    receivedAt: ts("received_at").notNull().defaultNow(),
    readAt: ts("read_at"),
  },
  (table) => [
    uniqueIndex("messages_inbox_dedupe_uq").on(table.inboxId, table.dedupeHash),
    index("messages_inbox_received_idx").on(table.inboxId, table.receivedAt.desc()),
  ],
);

/** EmailAttachment: stored inline in PostgreSQL; dangerous types keep metadata only. */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id").notNull().unique(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentId: text("content_id"),
    disposition: text("disposition").$type<"attachment" | "inline">().notNull(),
    isBlocked: boolean("is_blocked").notNull().default(false),
    blockedReason: text("blocked_reason"),
    sha256: text("sha256").notNull(),
    content: bytea("content"),
    createdAt: createdAt(),
  },
  (table) => [index("attachments_message_idx").on(table.messageId)],
);

export type IngestProvider = "smtp" | "mailgun" | "webhook";
export type IngestStatus = "pending" | "processing" | "completed" | "rejected" | "failed";
export interface IngestResult {
  delivered: number;
  duplicates?: number;
  probes?: string[];
  rejected?: { recipient: string; reason: string }[];
}

/** Durable ingestion queue (processed by the worker with FOR UPDATE SKIP LOCKED). */
export const ingestJobs = pgTable(
  "ingest_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").$type<IngestProvider>().notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: text("status").$type<IngestStatus>().notNull().default("pending"),
    envelopeFrom: text("envelope_from"),
    recipients: jsonb("recipients").$type<string[]>().notNull(),
    raw: bytea("raw"),
    rawSize: integer("raw_size").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: ts("run_at").notNull().defaultNow(),
    lockedAt: ts("locked_at"),
    lastError: text("last_error"),
    result: jsonb("result").$type<IngestResult>(),
    remoteIpHash: text("remote_ip_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: ts("completed_at"),
  },
  (table) => [
    index("ingest_jobs_status_run_idx").on(table.status, table.runAt),
    index("ingest_jobs_created_idx").on(table.createdAt),
  ],
);

export const webhookFailures = pgTable(
  "webhook_failures",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: text("provider").notNull(),
    reason: text("reason").notNull(),
    statusCode: integer("status_code").notNull(),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (table) => [index("webhook_failures_created_idx").on(table.createdAt)],
);

export const webhookNonces = pgTable("webhook_nonces", {
  nonce: text("nonce").primaryKey(),
  createdAt: createdAt(),
});

/** RateLimitRecord: fixed-window counters keyed by scope + subject. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index("rate_limits_window_idx").on(table.windowStart),
  ],
);

export const ipBlocks = pgTable("ip_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  ipHash: text("ip_hash").notNull().unique(),
  label: text("label").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  expiresAt: ts("expires_at"),
});

/** ApiKey: developer keys tied to an account. Only a hash is stored. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    createdAt: createdAt(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (table) => [index("api_keys_user_idx").on(table.userId)],
);

/** AuditLog: administrative and security-relevant actions. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_action_idx").on(table.action),
  ],
);

export const systemSettings = pgTable("system_settings", {
  id: integer("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  updatedAt: updatedAt(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const dailyStats = pgTable("daily_stats", {
  day: date("day", { mode: "string" }).primaryKey(),
  inboxesCreated: integer("inboxes_created").notNull().default(0),
  messagesReceived: integer("messages_received").notNull().default(0),
  messagesRejected: integer("messages_rejected").notNull().default(0),
  ingestFailed: integer("ingest_failed").notNull().default(0),
  apiRequests: integer("api_requests").notNull().default(0),
});

export const contactRequests = pgTable(
  "contact_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    topic: text("topic").notNull(),
    message: text("message").notNull(),
    ipHash: text("ip_hash"),
    status: text("status").$type<"open" | "closed">().notNull().default("open"),
    createdAt: createdAt(),
  },
  (table) => [index("contact_requests_created_idx").on(table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Inbox = typeof inboxes.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type IngestJob = typeof ingestJobs.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
