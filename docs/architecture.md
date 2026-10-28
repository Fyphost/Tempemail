# Architecture

```
                 ┌──────────────┐  MX (port 25)   ┌──────────────────────────────┐
 sender MTA ───▶ │  SMTP server │ ───────────────▶│                              │
                 └──────────────┘   enqueue       │                              │
 Mailgun route ─▶ /api/webhooks/mailgun/mime ────▶│  ingest_jobs (PostgreSQL)    │
 CF Email Worker ▶ /api/webhooks/inbound ────────▶│                              │
                                                  └──────────────┬───────────────┘
                                                    NOTIFY jobs  │ claim (SKIP LOCKED)
                                                  ┌──────────────▼───────────────┐
                                                  │ Worker: parse → sanitize →   │
                                                  │ store message + attachments  │
                                                  │ NOTIFY tempemail_events      │
                                                  └──────────────┬───────────────┘
                                                                 │ LISTEN
 browser / API client ◀── SSE /api/inboxes/current/events ◀─ web │ (Next.js)
                     ◀── REST /api/... ◀─────────────────────────┘
```

## Components

| Path                          | Responsibility                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `src/app/(marketing)`         | Server-rendered public pages (static where possible)                                          |
| `src/app/app`                 | The inbox application (`/app`)                                                                |
| `src/app/admin`               | Administration dashboard (`/admin`)                                                           |
| `src/app/api`                 | REST API, SSE stream and inbound webhooks                                                     |
| `src/app/actions`             | Server Actions for sign-in, accounts, admin and contact (each re-checks authorization)        |
| `src/components`              | UI: design-system primitives (`ui/`), marketing, inbox, account and admin components          |
| `src/server/db`               | Drizzle schema, client and migrator                                                           |
| `src/server/mail`             | Address handling, MIME parsing, HTML sanitizing, recipient resolution, SMTP server, providers |
| `src/server/jobs`             | Durable queue, background runner, cleanup and DNS re-verification                             |
| `src/server/realtime`         | `LISTEN/NOTIFY` bus and SSE formatting                                                        |
| `src/server/auth`, `security` | Inbox tokens, sessions, API keys, CSRF, rate limits, IP hashing, passwords                    |
| `src/worker`                  | Worker and CLI entry points (bundled to `dist/` with esbuild)                                 |

## Ingestion pipeline

1. **Accept.** Every provider funnels into `acceptInbound()`. It normalizes envelope recipients (the SMTP envelope,
   never the `To:` header), rejects unknown recipients, enforces the global size limit, and records an
   `ingest_jobs` row. The dedupe key (SHA-256 of the raw message plus recipients) makes retried webhook deliveries
   and duplicate SMTP transactions idempotent.
2. **Process.** The worker claims jobs with `FOR UPDATE SKIP LOCKED`, parses the message once with `mailparser`,
   applies per-inbox limits (size, message cap, inbound rate), sanitizes HTML, evaluates attachments and inserts the
   message in a transaction that also reserves a slot in the inbox counter. A unique index on
   `(inbox_id, dedupe_hash)` is the last line of defence against duplicates.
3. **Notify.** `pg_notify` inside the same transaction tells every web instance about the new message only after it
   commits. Each web process holds one `LISTEN` connection and fans events out to SSE subscribers.
4. **Retry.** Transient failures back off exponentially (30 s → 30 min, five attempts). Permanent failures keep the
   raw payload for the failed-job retention period so administrators can retry them.
5. **Clean up.** Every minute the worker deletes expired inboxes (cascading to messages, attachments and tokens),
   notifies connected clients, and purges operational records according to the retention settings.

Swapping the inbound provider only touches `src/server/mail/providers` and a webhook route; the queue, processor and
UI are provider-agnostic.

## Security model

- **Inbox access** requires a 256-bit random token (`tei_…`), stored only as a SHA-256 hash. Browsers keep it in an
  `HttpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed over HTTPS); API clients send it as a bearer token. The email
  address is never accepted as proof of ownership, and messages from other inboxes always return `404`.
- **Addresses** are random (about 39 bits of entropy). **Public IDs** (`inb_`, `msg_`, `att_`) are random and
  unrelated to internal UUIDs, which are never exposed.
- **CSRF.** Cookie-authenticated writes must carry a matching `Origin` (or same-origin fetch metadata). Server Actions
  have Next.js' built-in origin check and re-verify the session and role.
- **Email HTML** is sanitized twice (allowlist via `sanitize-html` at ingestion and again at render time), served from
  a dedicated route with `Content-Security-Policy: default-src 'none'; script-src 'none'; …; sandbox`, and displayed
  in an `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox">` without `allow-scripts` or
  `allow-same-origin`. Remote images and CSS `url()` loads are blocked unless the reader opts in for that message.
  Links go through `/link`, which shows the destination and never redirects automatically.
- **Attachments** are always served as `application/octet-stream` with `Content-Disposition: attachment` and a
  sandboxing CSP. Executables, scripts and oversized files keep metadata only.
- **Webhooks** verify HMAC signatures with constant-time comparison, reject stale timestamps, and (for Mailgun,
  whose signature does not cover the body) reject reused tokens.
- **Rate limits**: per-IP API budget (in memory), shared PostgreSQL limits for address creation, sign-in, contact
  form, SMTP connections and inbound messages per inbox. Administrators can block networks; blocks are stored as
  keyed IP hashes.
- **Passwords** use scrypt (N=32768, r=8, p=1) with per-user salts; sign-in timing is equalized for unknown accounts.
- **Headers**: CSP, HSTS (production), `X-Frame-Options: DENY`, `nosniff`, a strict `Referrer-Policy` and
  `Permissions-Policy` are set in `next.config.ts`.
- **Privacy**: no analytics or third-party requests; IPs are stored only as HMAC hashes; message bodies, tokens and
  IPs are never logged.

### Known trade-offs

- The app CSP allows `'unsafe-inline'` scripts because nonce-based CSP would force every page to render dynamically.
  Email content, the only untrusted HTML, never renders in the app's origin context. A nonce-based CSP can be added
  in `src/proxy.ts` following the Next.js CSP guide if your threat model requires it.
- The general per-IP request budget is per process. Put a shared limit in the reverse proxy if you run many replicas.
- Attachments live in PostgreSQL. This keeps deletion transactional; for very large volumes, move them to object
  storage behind the same service functions.

## Data model

`inboxes` (TemporaryInbox), `inbox_tokens`, `messages` (EmailMessage), `attachments` (EmailAttachment), `users`
(UserAccount), `user_sessions`, `api_keys` (ApiKey), `domains` (DomainConfiguration), `rate_limits`
(RateLimitRecord), `audit_logs` (AuditLog), `ingest_jobs`, `webhook_failures`, `webhook_nonces`, `ip_blocks`,
`system_settings`, `daily_stats`, `contact_requests`. See `src/server/db/schema.ts` and the SQL in `drizzle/`.

## Configuration

- **Environment variables** (`.env.example`): infrastructure and secrets, validated with Zod at startup.
- **System settings** (Admin → Settings, stored in `system_settings`): plan limits, expiration, rate limits, API
  access, attachment policy and retention. Changes reach every process within about ten seconds.
