# Tempemail

A self-hosted temporary email service. Visitors get a private, disposable address in one click, receive real email
in real time, read it safely in the browser, and everything is deleted automatically when the address expires.

- **Real inbound mail:** built-in SMTP server (your own MX), Mailgun inbound routes, or Cloudflare Email Routing.
- **Real-time inbox:** Server-Sent Events backed by PostgreSQL `LISTEN/NOTIFY`, with adaptive polling as a fallback.
- **Safe reading:** HTML sanitized twice and rendered in a sandboxed, script-free iframe. Remote images are blocked
  until the reader opts in, links go through a warning page, and dangerous attachments are blocked.
- **Private by design:** inboxes open only with a secret session token, never by address. No account needed, no
  trackers, IPs stored only as keyed hashes.
- **Automatic expiry:** a visible countdown, optional extensions, and a cleanup job that permanently deletes
  expired inboxes, messages and attachments.
- **Developer API:** documented REST endpoints, SSE events and API keys (`/api-docs`).
- **Admin dashboard:** domains with MX and end-to-end delivery verification, inbox search, processing jobs with
  retry, webhook failures, IP blocks, users and plans, settings, audit log and contact requests (`/admin`).
- **Optional accounts and Premium:** longer retention, more concurrent addresses, premium-only domains and API keys,
  all switchable in Admin → Settings. There is no payment integration; plans are assigned by an administrator.

Stack: Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, shadcn/ui-style components on Radix,
Lucide icons, React Hook Form + Zod, Drizzle ORM, PostgreSQL, `smtp-server`, `mailparser`, `sanitize-html`, Vitest.

## Quick start (local development)

Requirements: Node.js 22.12+, Docker (for PostgreSQL) or an existing PostgreSQL 14+.

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL on localhost:5432 (+ tempemail_test database)
cp .env.example .env
```

Edit `.env` for local use:

```dotenv
APP_URL=http://localhost:3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tempemail
SESSION_SECRET=any-local-value-that-is-at-least-32-characters
TRUST_PROXY_HOPS=0
SKIP_MX_CHECK=true            # development only
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=change-me-please
```

Then, in two terminals:

```bash
npm run db:migrate
npm run dev           # web app on http://localhost:3000
npm run dev:worker    # SMTP on :2525, ingestion queue, cleanup
```

Make a domain receive mail locally:

1. Sign in at <http://localhost:3000/login> with the bootstrap admin and open **Admin → Domains**.
2. Add `inbox.test`, then send a real message to its verification address through the local SMTP server:
   `npm run test:smtp -- --to verify-xxxxxxxxxx@inbox.test`
3. Enable the domain, open <http://localhost:3000/app>, and send mail to your new address:
   `npm run test:smtp -- --to <address> --subject "Hello"`. It appears instantly.

## Scripts

| Command                                                     | Purpose                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev` / `npm run dev:worker`                        | Development servers                                                                         |
| `npm run build`                                             | Production build (`.next/standalone` and `dist/worker.mjs`, `dist/cli.mjs`)                 |
| `npm test`                                                  | Unit and integration tests (integration tests need `TEST_DATABASE_URL` or the dev database) |
| `npm run lint`, `npm run typecheck`, `npm run format:check` | Static checks                                                                               |
| `npm run db:generate`                                       | Create a migration after changing `src/server/db/schema.ts`                                 |
| `npm run db:migrate`                                        | Apply migrations                                                                            |
| `npm run admin:create -- --email … --password …`            | Create or promote an administrator                                                          |
| `npm run test:smtp -- --to …`                               | Send a real test message to the local SMTP server                                           |

Integration tests run against a real PostgreSQL database (default
`postgres://postgres:postgres@127.0.0.1:5432/tempemail_test`, override with `TEST_DATABASE_URL`). They cover inbox
creation, SMTP and webhook ingestion, signature checks, deduplication, real-time events and SSE, message reading and
rendering, attachments, cross-inbox authorization, expiration and cleanup, deletion, rate limiting, accounts, API
keys and admin operations.

## Documentation

- [DNS and inbound email](docs/dns-and-inbound-email.md): MX records, the three inbound options, domain
  verification and troubleshooting.
- [Deploying to production](docs/deployment.md): Docker Compose with automatic HTTPS, health checks, backups,
  upgrades, scaling and a production checklist.
- [Architecture](docs/architecture.md): components, ingestion pipeline, security model and data model.
- [Cloudflare Email Worker](integrations/cloudflare-email-worker/README.md)
- API reference: `/api-docs` on a running instance.

## Responsible use

Temporary addresses expire and cannot be recovered. They must not be used for banking, payments, password recovery
or any account that needs long-term access. The service is receive-only and includes abuse controls (rate limits,
network blocks, attachment filtering). Review the bundled privacy policy and terms of service for your jurisdiction
before going live.
