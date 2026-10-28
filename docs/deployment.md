# Deploying to production

The production setup is a single Docker image that runs in three roles, plus PostgreSQL and a reverse proxy:

| Service    | Command                     | Purpose                                                             |
| ---------- | --------------------------- | ------------------------------------------------------------------- |
| `web`      | `node server.js`            | Next.js app, REST API, webhooks, Server-Sent Events                 |
| `worker`   | `node dist/worker.mjs`      | SMTP server, ingestion queue consumer, cleanup and DNS jobs         |
| `migrate`  | `node dist/cli.mjs migrate` | One-shot database migrations before `web`/`worker` start            |
| `postgres` |                             | All persistent data, queue, rate limits and real-time fan-out       |
| `caddy`    |                             | TLS termination with automatic certificates, reverse proxy to `web` |

Redis is not required: PostgreSQL provides the job queue (`FOR UPDATE SKIP LOCKED`), shared rate limits, advisory
locks for scheduled jobs, and `LISTEN/NOTIFY` for real-time events.

## 1. Server requirements

- A Linux host with Docker Engine and the Compose plugin. 2 vCPU and 2 GB RAM handle a moderate load.
- Public ports **80** and **443** (web) and, if you use the built-in SMTP server, **25** (inbound mail).
- DNS: an A/AAAA record for the app host (for example `tempmail.example.com`) and the mail records described in
  [dns-and-inbound-email.md](./dns-and-inbound-email.md).

## 2. Configure

```bash
git clone https://github.com/Fyphost/Tempemail.git && cd Tempemail
cp .env.example .env
```

Edit `.env`. At minimum:

```dotenv
APP_URL=https://tempmail.example.com
APP_DOMAIN=tempmail.example.com
SESSION_SECRET=$(openssl rand -base64 48)      # paste the generated value
POSTGRES_PASSWORD=$(openssl rand -hex 24)      # alphanumeric, it is embedded in a URL
TRUST_PROXY_HOPS=1
SMTP_HOSTNAME=mx.example.com
MX_TARGETS=mx.example.com
ADMIN_BOOTSTRAP_EMAIL=you@example.com
ADMIN_BOOTSTRAP_PASSWORD=a-long-temporary-password
OPERATOR_NAME=Example Ltd
CONTACT_EMAIL=support@example.com
ABUSE_EMAIL=abuse@example.com
```

`DATABASE_URL` is assembled by `docker-compose.yml`; you do not need to set it there. Keep `.env` out of version
control (it is listed in `.gitignore` and `.dockerignore`).

## 3. Start

```bash
docker compose up -d --build
docker compose logs -f migrate web worker
```

Caddy requests a certificate for `APP_DOMAIN` on first start. Then:

1. Sign in at `https://tempmail.example.com/login` with the bootstrap administrator and change the password under
   **Account**. You can remove `ADMIN_BOOTSTRAP_*` from `.env` afterwards; it is only used while no admin exists.
2. Add and verify your receiving domain in **Admin → Domains**.
3. Review limits, retention and API access in **Admin → Settings**.

## 4. Health checks and monitoring

- `GET /api/health` (web) returns `200` when the app can reach PostgreSQL.
- `GET http://worker:8081/healthz` returns `200` when the worker is running and connected.
- Both are wired into the image and compose health checks.
- Logs are JSON lines on stdout. They never contain message bodies, tokens or raw IP addresses.
- **Admin → Overview** shows volumes, failed jobs, webhook failures and storage; **Admin → Email processing** lists
  individual deliveries.

## 5. Backups

PostgreSQL holds everything, including attachments. Back it up regularly, for example:

```bash
docker compose exec -T postgres pg_dump -U tempemail -Fc tempemail > backup-$(date +%F).dump
```

Because inboxes expire within hours, restoring old backups mainly recovers accounts, domains, settings and audit logs.

## 6. Upgrades

```bash
git pull
docker compose up -d --build
```

The `migrate` service applies new migrations before `web` and `worker` restart. Migrations are additive SQL files in
`drizzle/`, generated with `npm run db:generate` and reviewed in pull requests.

## 7. Scaling

- **Web:** stateless; run several replicas behind the proxy. Each keeps one `LISTEN` connection for real-time events.
  The general per-IP request budget is enforced per replica, while security-sensitive limits (address creation,
  sign-in, inbound flood control) are shared through PostgreSQL. Run every replica from the same image: Next.js
  generates the Server Actions encryption key per build (or set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` at build time).
- **Worker:** run more than one for redundancy. Jobs are claimed with `SKIP LOCKED`, and cleanup and DNS checks are
  guarded by advisory locks, so they run once.
- **SMTP:** put a TCP load balancer in front of several workers. If it sends the PROXY protocol, set
  `SMTP_USE_PROXY_PROTOCOL=true` so per-IP limits see the real client.
- **Database:** size `DATABASE_POOL_MAX` so that `replicas × pool` stays below PostgreSQL's `max_connections`.

## 8. Running without Docker

```bash
npm ci
APP_URL=https://tempmail.example.com npm run build
npm run db:migrate                         # or: node dist/cli.mjs migrate
node .next/standalone/server.js            # web (copy .next/static into .next/standalone/.next/ first)
node dist/worker.mjs                       # worker
```

Run both under a process manager (systemd, PM2) and put a TLS-terminating reverse proxy in front of the web process.
If you use nginx, disable buffering for Server-Sent Events:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_http_version 1.1;
  proxy_buffering off;          # required for /api/inboxes/current/events
  proxy_read_timeout 15m;
}
```

## Production checklist

- [ ] HTTPS only (`APP_URL` starts with `https://`). Cookies then use the `__Host-` prefix and `Secure`.
- [ ] `SESSION_SECRET` is unique, random and at least 32 characters. Changing it invalidates stored IP hashes and
      blocks.
- [ ] `TRUST_PROXY_HOPS` matches the number of proxies in front of the app. With the wrong value clients can spoof
      their IP address and evade rate limits.
- [ ] Only ports 80, 443 and 25 are publicly reachable. PostgreSQL and the worker health port are not exposed.
- [ ] Webhook secrets are set only for the providers you use; unused webhook endpoints answer `404`.
- [ ] `SKIP_MX_CHECK` is `false`.
- [ ] Legal pages show your operator name and contact addresses, and you have reviewed `/privacy` and `/terms` for
      your jurisdiction.
- [ ] Backups are scheduled and a restore has been tested.
