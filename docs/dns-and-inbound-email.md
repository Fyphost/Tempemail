# DNS and inbound email

Tempemail only offers a domain to visitors after three things are true:

1. **MX records** for the domain point at your inbound infrastructure (checked automatically).
2. **A real test message** sent from outside reached the domain's verification address through the full pipeline.
3. An administrator **enabled** the domain in **Admin → Domains**.

Until then the domain is listed in the admin area as "Not live" and is never shown in the app or returned by
`GET /api/domains`.

You can receive mail in three ways. Pick one per domain.

| Option                                                            | MX points to                   | Best for                       |
| ----------------------------------------------------------------- | ------------------------------ | ------------------------------ |
| [A. Built-in SMTP server](#a-built-in-smtp-server-self-hosted-mx) | Your server (`mx.example.com`) | Full control, no third party   |
| [B. Mailgun inbound routes](#b-mailgun-inbound-routes)            | `mxa/mxb.mailgun.org`          | Hosts where port 25 is blocked |
| [C. Cloudflare Email Routing](#c-cloudflare-email-routing)        | `*.mx.cloudflare.net`          | Domains already on Cloudflare  |

Use a dedicated domain or subdomain for disposable addresses (for example `mail.example.com` or
`example-inbox.com`), not the domain you use for your own email. Anything sent to the disposable domain is delivered
to temporary inboxes, and abusive senders may hurt that domain's reputation.

---

## A. Built-in SMTP server (self-hosted MX)

The worker runs an inbound-only SMTP server (`SMTP_PORT`, default 2525; the production compose file publishes it on
port 25). It never relays mail: AUTH is disabled, and every `RCPT TO` must match a live inbox or a domain verification
address. Unknown recipients are refused with `550 5.1.1` during the SMTP conversation, so nothing is stored for them
and no bounces are sent.

### 1. Open port 25

Inbound TCP port 25 must reach the worker. Check your provider's firewall and security groups. Some cloud providers
block port 25 by default; use option B or C if you cannot open it.

```bash
# From a different machine:
nc -vz mx.example.com 25
```

### 2. DNS records

For a disposable domain `inbox-example.com` served by a host with the public IP `203.0.113.10`:

| Type | Name                       | Value                | Notes                                                          |
| ---- | -------------------------- | -------------------- | -------------------------------------------------------------- |
| A    | `mx.example.com`           | `203.0.113.10`       | The SMTP host. Use AAAA as well if you have IPv6.              |
| MX   | `inbox-example.com`        | `10 mx.example.com`  | Every MX record must point at your infrastructure.             |
| TXT  | `inbox-example.com`        | `v=spf1 -all`        | The domain never sends mail; this stops spoofed outbound mail. |
| TXT  | `_dmarc.inbox-example.com` | `v=DMARC1; p=reject` | Same reason.                                                   |

Optionally set a PTR (reverse DNS) record for `203.0.113.10` → `mx.example.com` with your hosting provider. It is not
required for receiving, but some senders log a warning without it.

### 3. Configure the app

```dotenv
SMTP_ENABLED=true
SMTP_HOSTNAME=mx.example.com
MX_TARGETS=mx.example.com
```

### 4. TLS for STARTTLS (recommended)

Senders such as Gmail deliver over plain SMTP if STARTTLS is unavailable, but many show a "did not encrypt" warning.
Provide a certificate for `SMTP_HOSTNAME`:

```dotenv
SMTP_TLS_KEY_FILE=/certs/mx.example.com.key
SMTP_TLS_CERT_FILE=/certs/mx.example.com.crt
```

Mount the files read-only into the worker container. The worker re-reads the certificate every six hours, so renewals
(for example by certbot or Caddy) are picked up without a restart.

---

## B. Mailgun inbound routes

1. Add the domain in Mailgun (**Sending → Domains**) and publish the MX records Mailgun shows (US: `mxa.mailgun.org`,
   `mxb.mailgun.org`; EU: `mxa.eu.mailgun.org`, `mxb.eu.mailgun.org`).
2. Create a route (**Receiving → Create route**):
   - Expression type: **Match recipient** with `.*@inbox-example.com` (or **Catch all**).
   - Action: **Forward** to `https://tempmail.example.com/api/webhooks/mailgun/mime`.
     The URL must end in `mime`; Mailgun then posts the raw message as `body-mime`.
3. Copy the **HTTP webhook signing key** (**Settings → API security**) into the app:

   ```dotenv
   MAILGUN_WEBHOOK_SIGNING_KEY=key-from-mailgun
   MX_TARGETS=mxa.mailgun.org,mxb.mailgun.org
   ```

Every post is verified with HMAC-SHA256 over the timestamp and token. Requests older than
`WEBHOOK_MAX_SKEW_SECONDS` (default 300) or reusing a token are refused, and identical deliveries are deduplicated.
For recipients that have no inbox the endpoint answers `406`, which tells Mailgun not to retry.

---

## C. Cloudflare Email Routing

Follow [`integrations/cloudflare-email-worker/README.md`](../integrations/cloudflare-email-worker/README.md). In
short: enable Email Routing (Cloudflare publishes `route1/2/3.mx.cloudflare.net`), deploy the bundled Email Worker,
point the catch-all rule at it, and set:

```dotenv
INBOUND_WEBHOOK_SECRET=a-long-random-secret
MX_TARGETS=*.mx.cloudflare.net
```

The Worker signs each raw message (`X-Tempemail-Signature: v1=<hex HMAC-SHA256>` over the timestamp, recipients,
sender and body hash) and rejects unknown recipients at the edge.

### Custom relays

Any MTA can deliver through the same signed endpoint, `POST /api/webhooks/inbound`, with the raw message as the body
and these headers:

| Header                   | Value                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `Content-Type`           | `message/rfc822`                                                                                          |
| `X-Tempemail-Timestamp`  | Current Unix time in seconds                                                                              |
| `X-Tempemail-Recipients` | Envelope recipients, comma separated                                                                      |
| `X-Tempemail-Sender`     | Envelope sender (may be empty)                                                                            |
| `X-Tempemail-Signature`  | `v1=` + hex HMAC-SHA256 of `timestamp\nrecipients\nsender\nsha256hex(body)` with `INBOUND_WEBHOOK_SECRET` |

A Postfix pipe transport could call a script like this (`${recipient}` and `${sender}` passed by `pipe(8)`):

```bash
#!/usr/bin/env bash
set -euo pipefail
body=$(mktemp); trap 'rm -f "$body"' EXIT; cat > "$body"
ts=$(date +%s); rcpt="$1"; sender="$2"
hash=$(sha256sum "$body" | cut -d' ' -f1)
sig=$(printf '%s\n%s\n%s\n%s' "$ts" "$rcpt" "$sender" "$hash" | openssl dgst -sha256 -hmac "$INBOUND_WEBHOOK_SECRET" -r | cut -d' ' -f1)
curl -fsS -X POST https://tempmail.example.com/api/webhooks/inbound \
  -H "Content-Type: message/rfc822" -H "X-Tempemail-Timestamp: $ts" \
  -H "X-Tempemail-Recipients: $rcpt" -H "X-Tempemail-Sender: $sender" \
  -H "X-Tempemail-Signature: v1=$sig" --data-binary @"$body"
```

The endpoint answers `202` when the message is queued (or was already received), `404` for unknown recipients,
`413` when it is too large and `401` for a bad signature.

---

## Verify the domain

1. **Admin → Domains → Add domain.** The domain starts disabled.
2. Click **Check DNS now**. The status changes to **MX verified** when every published MX host matches the expected
   hosts (`MX_TARGETS`, or the per-domain override; `*.suffix` wildcards are supported).
3. Send any email from an outside mailbox (Gmail, Outlook, …) to the **verification address** shown on the card, for
   example `verify-k3x9…@inbox-example.com`. When it arrives, the card shows **Test delivery received**. The message
   itself is discarded.
4. Turn on **Enabled**. The domain now appears in the app.

DNS is re-checked every 30 minutes. If the MX records stop matching, the domain is taken out of rotation until it
verifies again. Existing inboxes keep receiving mail while the domain stays enabled.

### Local development

DNS checks cannot pass for a local domain. Set `SKIP_MX_CHECK=true` in development only, add a domain such as
`inbox.test`, and complete the test-delivery step with the bundled script, which sends a real message to the local
SMTP server:

```bash
npm run test:smtp -- --to verify-xxxxxxxxxx@inbox.test
```

`SKIP_MX_CHECK` never skips the test delivery.

## Troubleshooting

| Symptom                              | Check                                                                                                                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MX points elsewhere**              | `dig +short MX inbox-example.com`. All records must point at your infrastructure; remove old ones.                                                                                                        |
| **No MX records**                    | The record is missing or DNS has not propagated yet.                                                                                                                                                      |
| Test delivery never arrives          | Port 25 reachability (option A), the Mailgun route URL ends in `/mime` (B), the Worker is bound to the catch-all rule (C). See **Admin → Email processing** for rejected deliveries and webhook failures. |
| `invalid_signature` webhook failures | The secret or signing key differs between the provider and `.env`, or the server clock is off (check NTP).                                                                                                |
| Mail for an address is rejected      | The inbox expired or was deleted, or the domain is disabled. Rejections are recorded under **Admin → Email processing**.                                                                                  |
