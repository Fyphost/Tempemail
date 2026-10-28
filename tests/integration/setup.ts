import { afterAll, beforeEach } from "vitest";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/tempemail_test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DATABASE_URL,
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "integration-test-session-secret-0123456789abcdef",
  INBOUND_WEBHOOK_SECRET: "integration-test-inbound-secret",
  MAILGUN_WEBHOOK_SIGNING_KEY: "integration-test-mailgun-key",
  SKIP_MX_CHECK: "true",
  TRUST_PROXY_HOPS: "1",
});

const { getPool, closeDb } = await import("@/server/db/client");
const { closeRealtimeBus } = await import("@/server/realtime/bus");
const { invalidateSettingsCache } = await import("@/server/settings");
const { invalidateDomainCache } = await import("@/server/domains/service");

const TABLES = [
  "attachments",
  "messages",
  "inbox_tokens",
  "inboxes",
  "domains",
  "api_keys",
  "user_sessions",
  "audit_logs",
  "ip_blocks",
  "system_settings",
  "users",
  "ingest_jobs",
  "webhook_failures",
  "webhook_nonces",
  "rate_limits",
  "daily_stats",
  "contact_requests",
  "worker_heartbeats",
];

beforeEach(async () => {
  await getPool().query(`truncate table ${TABLES.join(", ")} restart identity cascade`);
  invalidateSettingsCache();
  invalidateDomainCache();
  const memory = globalThis as { __tempemailMemoryLimiter?: unknown };
  memory.__tempemailMemoryLimiter = undefined;
});

afterAll(async () => {
  await closeRealtimeBus();
  await closeDb();
});
