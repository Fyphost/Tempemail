# Cloudflare Email Routing → Tempemail

Use this Worker when you want Cloudflare's MX servers to receive mail for your domain instead of exposing the
built-in SMTP server on port 25.

## How it works

1. Cloudflare Email Routing accepts mail for the domain (its MX records point to Cloudflare).
2. A catch-all routing rule sends every message to this Email Worker.
3. The Worker signs the raw message with `INBOUND_WEBHOOK_SECRET` and posts it to
   `POST /api/webhooks/inbound`.
4. Tempemail verifies the signature, rejects unknown recipients (the Worker then rejects the message with
   `setReject`), and queues the rest for processing.

## Setup

1. In the Cloudflare dashboard, open the domain → **Email** → **Email Routing** and enable it. Cloudflare adds its
   MX records (`route1/2/3.mx.cloudflare.net`) and an SPF record.
2. Set `MX_TARGETS=*.mx.cloudflare.net` in Tempemail's `.env` (or set the domain's expected MX hosts in
   **Admin → Domains**).
3. Generate a secret (`openssl rand -hex 32`), set it as `INBOUND_WEBHOOK_SECRET` in Tempemail, and restart the web
   container.
4. Deploy the Worker:

   ```bash
   cd integrations/cloudflare-email-worker
   cp wrangler.toml.example wrangler.toml   # set INBOUND_URL
   npx wrangler secret put INBOUND_WEBHOOK_SECRET
   npx wrangler deploy
   ```

5. In **Email Routing → Routing rules**, set the **Catch-all address** action to **Send to a Worker** →
   `tempemail-inbound`.
6. In **Admin → Domains**, add the domain, click **Check DNS now**, then send an email from any outside mailbox to
   the verification address shown. Enable the domain once both checks pass.

Messages larger than `MAX_BYTES` (and Cloudflare's own Email Routing size limit) are rejected.
