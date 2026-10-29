import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/marketing/code-block";
import { site, siteUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "API documentation",
  description:
    "REST API for temporary inboxes: create addresses, receive messages in real time over Server-Sent Events, read sanitized HTML and text, and manage attachments.",
  alternates: { canonical: "/api-docs" },
};

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface Endpoint {
  id: string;
  method: Method;
  path: string;
  summary: string;
  auth: string;
  params?: { name: string; in: "body" | "query" | "path"; type: string; description: string }[];
  example: string;
  response?: string;
}

const methodTone: Record<Method, string> = {
  GET: "bg-blue-50 text-blue-700 border-blue-100",
  POST: "bg-green-50 text-green-700 border-green-200/70",
  PATCH: "bg-amber-50 text-amber-700 border-amber-200/70",
  DELETE: "bg-red-50 text-red-700 border-red-200/70",
};

function endpoints(base: string): Endpoint[] {
  return [
    {
      id: "list-domains",
      method: "GET",
      path: "/api/domains",
      summary: "Domains that are configured, verified and currently receiving email.",
      auth: "None (an API key or session reveals premium domains when your plan includes them).",
      example: `curl -s ${base}/api/domains`,
      response: `{
  "data": {
    "domains": [{ "name": "mail.example.com", "premium": false }],
    "defaultDomain": "mail.example.com"
  }
}`,
    },
    {
      id: "create-inbox",
      method: "POST",
      path: "/api/inboxes",
      summary:
        "Create a new temporary inbox. The response contains the address and a secret inbox token. The token is shown only once; store it like a password.",
      auth: "None for anonymous inboxes. Send an API key (tek_…) to create an inbox owned by your account with your plan's limits.",
      params: [
        {
          name: "domain",
          in: "body",
          type: "string",
          description: "Optional. One of the names from GET /api/domains.",
        },
        {
          name: "ttlMinutes",
          in: "body",
          type: "integer",
          description: "Optional. Custom lifetime, only on plans with custom retention.",
        },
        {
          name: "replaceCurrent",
          in: "body",
          type: "boolean",
          description: "Browser sessions only: delete the inbox in the current session cookie.",
        },
      ],
      example: `curl -s -X POST ${base}/api/inboxes \\
  -H "Content-Type: application/json" \\
  -d '{"domain": "mail.example.com"}'`,
      response: `{
  "data": {
    "inbox": {
      "id": "inb_8Xq2LmR4sT9vB1nKc3Wd",
      "address": "kavitore4821@mail.example.com",
      "domain": "mail.example.com",
      "createdAt": "2026-10-28T12:00:00.000Z",
      "expiresAt": "2026-10-28T13:00:00.000Z",
      "maxExpiresAt": "2026-10-28T18:00:00.000Z",
      "messageCount": 0,
      "plan": "free",
      "owned": false,
      "limits": { "maxMessages": 100, "maxMessageSizeKb": 10240, "extendMinutes": 60, "canExtend": true }
    },
    "token": "tei_…"
  }
}`,
    },
    {
      id: "list-inboxes",
      method: "GET",
      path: "/api/inboxes",
      summary: "Active inboxes owned by your account.",
      auth: "API key (tek_…) or a signed-in session.",
      example: `curl -s ${base}/api/inboxes -H "Authorization: Bearer $API_KEY"`,
    },
    {
      id: "get-inbox",
      method: "GET",
      path: "/api/inboxes/current",
      summary: "Details of the inbox the token belongs to. Returns 410 inbox_expired after expiry.",
      auth: "Inbox token.",
      example: `curl -s ${base}/api/inboxes/current -H "Authorization: Bearer $TOKEN"`,
    },
    {
      id: "extend-inbox",
      method: "POST",
      path: "/api/inboxes/current/extend",
      summary: "Extend the lifetime by the plan's extension step, up to the maximum lifetime.",
      auth: "Inbox token.",
      example: `curl -s -X POST ${base}/api/inboxes/current/extend -H "Authorization: Bearer $TOKEN"`,
    },
    {
      id: "delete-inbox",
      method: "DELETE",
      path: "/api/inboxes/current",
      summary: "Delete the inbox and all of its messages and attachments immediately.",
      auth: "Inbox token.",
      example: `curl -s -X DELETE ${base}/api/inboxes/current -H "Authorization: Bearer $TOKEN"`,
    },
    {
      id: "list-messages",
      method: "GET",
      path: "/api/inboxes/current/messages",
      summary: "Messages in the inbox, newest first, with cursor pagination and search.",
      auth: "Inbox token.",
      params: [
        { name: "limit", in: "query", type: "integer", description: "1–100, default 50." },
        {
          name: "cursor",
          in: "query",
          type: "string",
          description: "nextCursor from the previous page.",
        },
        {
          name: "q",
          in: "query",
          type: "string",
          description: "Search subject, sender and body text.",
        },
        {
          name: "unread",
          in: "query",
          type: "boolean",
          description: "true to return unread messages only.",
        },
      ],
      example: `curl -s "${base}/api/inboxes/current/messages?limit=20" -H "Authorization: Bearer $TOKEN"`,
      response: `{
  "data": {
    "messages": [{
      "id": "msg_3hJk9QpLz2Xc8VbN1mRt",
      "from": { "name": "Acme", "address": "noreply@acme.example" },
      "subject": "Your verification code",
      "preview": "Use 482913 to verify your account…",
      "receivedAt": "2026-10-28T12:01:12.000Z",
      "read": false,
      "attachmentCount": 0,
      "sizeBytes": 18234
    }],
    "nextCursor": null,
    "total": 1,
    "unread": 1
  }
}`,
    },
    {
      id: "get-message",
      method: "GET",
      path: "/api/messages/{id}",
      summary:
        "Full message: headers of interest, plain text, sanitized HTML (cid: references left intact) and attachment metadata. Marks the message as read unless markRead=false.",
      auth: "Inbox token. Messages from other inboxes always return 404.",
      params: [
        {
          name: "markRead",
          in: "query",
          type: "boolean",
          description: "false to leave the message unread.",
        },
      ],
      example: `curl -s ${base}/api/messages/msg_3hJk9QpLz2Xc8VbN1mRt -H "Authorization: Bearer $TOKEN"`,
    },
    {
      id: "update-message",
      method: "PATCH",
      path: "/api/messages/{id}",
      summary: "Mark a message read or unread.",
      auth: "Inbox token.",
      params: [{ name: "read", in: "body", type: "boolean", description: "Required." }],
      example: `curl -s -X PATCH ${base}/api/messages/msg_3hJk9QpLz2Xc8VbN1mRt \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"read": false}'`,
    },
    {
      id: "delete-message",
      method: "DELETE",
      path: "/api/messages/{id}",
      summary: "Delete a single message.",
      auth: "Inbox token.",
      example: `curl -s -X DELETE ${base}/api/messages/msg_3hJk9QpLz2Xc8VbN1mRt -H "Authorization: Bearer $TOKEN"`,
    },
    {
      id: "message-body",
      method: "GET",
      path: "/api/messages/{id}/body",
      summary:
        "A standalone, sanitized HTML document for display in a sandboxed iframe. Served with a Content-Security-Policy that forbids scripts and network access. Remote images load only with images=1.",
      auth: "Inbox token or session cookie.",
      params: [
        {
          name: "images",
          in: "query",
          type: "1",
          description: "Allow remote images (reveals the reader's IP to the sender).",
        },
      ],
      example: `curl -s "${base}/api/messages/msg_3hJk9QpLz2Xc8VbN1mRt/body" -H "Authorization: Bearer $TOKEN"`,
    },
    {
      id: "attachment",
      method: "GET",
      path: "/api/messages/{id}/attachments/{attachmentId}",
      summary:
        "Download an attachment. Files are served as application/octet-stream with Content-Disposition: attachment. Blocked file types return 403.",
      auth: "Inbox token or session cookie.",
      example: `curl -s -OJ ${base}/api/messages/msg_…/attachments/att_… -H "Authorization: Bearer $TOKEN"`,
    },
  ];
}

const errorCodes: [string, number, string][] = [
  [
    "validation_failed",
    422,
    "The body or query did not pass validation. details.issues lists each problem.",
  ],
  ["unauthorized", 401, "No token, an unknown token, or a deleted inbox."],
  ["inbox_expired", 410, "The inbox expired; its messages are deleted."],
  [
    "forbidden",
    403,
    "Not allowed: cross-site request, blocked network, plan restriction or blocked attachment.",
  ],
  ["not_found", 404, "The resource does not exist or belongs to another inbox."],
  ["domain_unavailable", 422, "The requested domain is not available for new addresses."],
  ["no_domains", 503, "No receiving domain has been verified yet."],
  ["inbox_limit_reached", 409, "Your plan's limit of concurrent addresses is reached."],
  ["max_lifetime_reached", 409, "The inbox cannot be extended any further."],
  [
    "rate_limited",
    429,
    "Too many requests. Wait for the number of seconds in the Retry-After header.",
  ],
  ["payload_too_large", 413, "The request body exceeds the allowed size."],
];

const sections = [
  { id: "overview", label: "Overview" },
  { id: "quickstart", label: "Quickstart" },
  { id: "authentication", label: "Authentication" },
  { id: "endpoints", label: "Endpoints" },
  { id: "realtime", label: "Real-time events" },
  { id: "errors", label: "Errors & limits" },
  { id: "inbound", label: "Inbound webhooks" },
];

function MethodBadge({ method }: { method: Method }) {
  return (
    <span
      className={cn(
        "inline-flex w-16 shrink-0 justify-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold",
        methodTone[method],
      )}
    >
      {method}
    </span>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-2xl font-semibold tracking-tight">
      <a href={`#${id}`} className="hover:text-primary">
        {children}
      </a>
    </h2>
  );
}

export default function ApiDocsPage() {
  const base = siteUrl();
  const list = endpoints(base);
  const quickstart = `# Create an inbox and keep the token
TOKEN=$(curl -s -X POST ${base}/api/inboxes -H "Content-Type: application/json" -d '{}' | jq -r .data.token)
ADDRESS=$(curl -s ${base}/api/inboxes/current -H "Authorization: Bearer $TOKEN" | jq -r .data.inbox.address)
echo "Send a test email to $ADDRESS"

# Poll until a message arrives, then print its text
until [ "$(curl -s ${base}/api/inboxes/current/messages -H "Authorization: Bearer $TOKEN" | jq .data.total)" -gt 0 ]; do sleep 3; done
ID=$(curl -s ${base}/api/inboxes/current/messages -H "Authorization: Bearer $TOKEN" | jq -r '.data.messages[0].id')
curl -s ${base}/api/messages/$ID -H "Authorization: Bearer $TOKEN" | jq -r .data.message.text`;

  const sseExample = `const response = await fetch("${base}/api/inboxes/current/events", {
  headers: { Authorization: \`Bearer \${token}\`, Accept: "text/event-stream" },
});
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
for (;;) {
  const { value, done } = await reader.read();
  if (done) break; // the stream is recycled periodically: reconnect
  buffer += decoder.decode(value, { stream: true });
  let end;
  while ((end = buffer.indexOf("\\n\\n")) >= 0) {
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    const event = /^event: (.*)$/m.exec(frame)?.[1];
    const data = /^data: (.*)$/m.exec(frame)?.[1];
    if (event === "message.received") console.log("new message", JSON.parse(data).messageId);
  }
}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav aria-label="Documentation" className="sticky top-24 space-y-1 text-sm">
            <p className="mb-3 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              API reference
            </p>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded-lg px-3 py-1.5 text-foreground/75 hover:bg-secondary hover:text-foreground"
              >
                {section.label}
              </a>
            ))}
            <div className="mt-4 border-t border-border pt-4">
              {list.map((endpoint) => (
                <a
                  key={endpoint.id}
                  href={`#${endpoint.id}`}
                  className="flex items-center gap-2 rounded-lg px-3 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <span className="w-11 font-mono text-[10px] font-semibold">
                    {endpoint.method}
                  </span>
                  <span className="truncate font-mono">{endpoint.path.replace("/api", "")}</span>
                </a>
              ))}
            </div>
          </nav>
        </aside>

        <article className="min-w-0 space-y-16">
          <header id="overview" className="scroll-mt-24">
            <p className="text-sm font-semibold text-primary">Developers</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">{site.name} API</h1>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">
              The same REST API that powers this website. Create disposable inboxes, receive real
              email in real time and read messages from scripts, CI pipelines and end-to-end tests.
            </p>
            <dl className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                ["Base URL", base],
                ["Format", "JSON over HTTPS"],
                ["Envelope", "{ data } on success, { error } on failure"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-muted p-4">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-mono text-sm break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </header>

          <section className="space-y-4">
            <H2 id="quickstart">Quickstart</H2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A complete round trip with <code className="font-mono text-foreground">curl</code> and{" "}
              <code className="font-mono text-foreground">jq</code>: create an inbox, wait for a
              message and print it.
            </p>
            <CodeBlock code={quickstart} title="bash" />
          </section>

          <section className="space-y-4">
            <H2 id="authentication">Authentication</H2>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  title: "Inbox token",
                  prefix: "tei_…",
                  body: "Returned once by POST /api/inboxes. Send it as Authorization: Bearer for every inbox and message endpoint. Possession of the token is the only proof of ownership; the address alone grants nothing.",
                },
                {
                  title: "Session cookie",
                  prefix: "HttpOnly",
                  body: "Browsers receive the same token in an HttpOnly, SameSite=Lax cookie. Cookie-authenticated writes must come from this site's origin.",
                },
                {
                  title: "API key",
                  prefix: "tek_…",
                  body: "Created in your account when your plan includes API access. Use it to create inboxes owned by your account and list them. Revoke keys at any time.",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                >
                  <p className="flex items-center justify-between">
                    <span className="font-semibold">{card.title}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {card.prefix}
                    </code>
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
                </div>
              ))}
            </div>
            <p className="rounded-xl border border-amber-200/70 bg-warning-soft p-4 text-sm text-amber-900">
              Treat tokens and keys as secrets. Never embed them in public client-side code or
              commit them to source control.
            </p>
          </section>

          <section className="space-y-6">
            <H2 id="endpoints">Endpoints</H2>
            {list.map((endpoint) => (
              <div
                key={endpoint.id}
                id={endpoint.id}
                className="scroll-mt-24 rounded-2xl border border-border bg-card shadow-soft"
              >
                <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
                  <MethodBadge method={endpoint.method} />
                  <code className="font-mono text-sm font-medium break-all">{endpoint.path}</code>
                </div>
                <div className="space-y-4 p-5">
                  <p className="text-sm leading-relaxed text-foreground/85">{endpoint.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/80">Auth:</span> {endpoint.auth}
                  </p>
                  {endpoint.params ? (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted text-xs text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2 font-medium">Parameter</th>
                            <th className="px-4 py-2 font-medium">In</th>
                            <th className="px-4 py-2 font-medium">Type</th>
                            <th className="px-4 py-2 font-medium">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {endpoint.params.map((param) => (
                            <tr key={param.name}>
                              <td className="px-4 py-2 font-mono text-xs font-medium">
                                {param.name}
                              </td>
                              <td className="px-4 py-2 text-xs text-muted-foreground">
                                {param.in}
                              </td>
                              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                {param.type}
                              </td>
                              <td className="px-4 py-2 text-xs text-foreground/80">
                                {param.description}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <CodeBlock code={endpoint.example} title="Request" />
                  {endpoint.response ? (
                    <CodeBlock code={endpoint.response} title="Response" tone="light" />
                  ) : null}
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <H2 id="realtime">Real-time events</H2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <code className="font-mono text-foreground">GET /api/inboxes/current/events</code>{" "}
              streams Server-Sent Events for the inbox. Streams are recycled every few minutes and
              send a heartbeat comment every 20 seconds; reconnect when a stream ends
              (browsers&apos; <code className="font-mono text-foreground">EventSource</code> does
              this automatically). If your environment cannot keep a stream open, poll the messages
              endpoint every 5–30 seconds instead.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Event</th>
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-4 py-2 font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {[
                    [
                      "ready",
                      "{ inboxId, expiresAt }",
                      "The stream is subscribed. Fetch the message list once to catch up.",
                    ],
                    ["message.received", "{ messageId }", "A new message was stored."],
                    ["message.deleted", "{ messageId }", "A message was deleted."],
                    [
                      "inbox.updated",
                      "{ expiresAt }",
                      "The lifetime changed (for example after an extension).",
                    ],
                    [
                      "inbox.deleted",
                      '{ reason: "expired" | "deleted" }',
                      "The inbox is gone. The stream closes.",
                    ],
                    ["reconnect", "{}", "The server is recycling the stream. Reconnect."],
                  ].map(([event, data, meaning]) => (
                    <tr key={event}>
                      <td className="px-4 py-2 font-mono font-medium">{event}</td>
                      <td className="px-4 py-2 font-mono text-muted-foreground">{data}</td>
                      <td className="px-4 py-2 text-foreground/80">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CodeBlock code={sseExample} title="Node.js / browser" />
          </section>

          <section className="space-y-4">
            <H2 id="errors">Errors & limits</H2>
            <CodeBlock
              tone="light"
              title="Error response"
              code={`HTTP/1.1 429 Too Many Requests
Retry-After: 1260

{ "error": { "code": "rate_limited", "message": "You have created too many addresses recently…", "details": { "retryAfterSeconds": 1260 } } }`}
            />
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Code</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {errorCodes.map(([code, status, meaning]) => (
                    <tr key={code}>
                      <td className="px-4 py-2 font-mono font-medium">{code}</td>
                      <td className="px-4 py-2 font-mono text-muted-foreground">{status}</td>
                      <td className="px-4 py-2 text-foreground/80">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Every client IP has a per-minute request budget, and address creation is limited per
              IP (or per account for API keys). Current values are listed on the{" "}
              <Link href="/pricing" className="font-medium text-primary hover:text-primary-strong">
                plans page
              </Link>
              . Inboxes accept a limited number of messages and a maximum message size; extra or
              oversized mail is rejected.
            </p>
          </section>

          <section className="space-y-4">
            <H2 id="inbound">Inbound webhooks (operators)</H2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Self-hosters can receive mail with the built-in SMTP server or through an inbound
              provider. Both webhooks reject unknown recipients, verify signatures, and deduplicate
              retried deliveries.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="flex items-center gap-2 font-semibold">
                  <MethodBadge method="POST" />
                  <code className="font-mono text-sm">/api/webhooks/mailgun/mime</code>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Target of a Mailgun route action{" "}
                  <code className="font-mono text-foreground">forward(&quot;…/mime&quot;)</code>.
                  Verifies the HMAC signature with your webhook signing key, rejects stale
                  timestamps and reused tokens.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="flex items-center gap-2 font-semibold">
                  <MethodBadge method="POST" />
                  <code className="font-mono text-sm">/api/webhooks/inbound</code>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Raw MIME signed with HMAC-SHA256 over timestamp, recipients, sender and body hash.
                  Used by the bundled Cloudflare Email Worker and custom relays.
                </p>
              </div>
            </div>
            <CodeBlock
              title="Signed inbound request"
              code={`POST /api/webhooks/inbound
Content-Type: message/rfc822
X-Tempemail-Timestamp: 1793102400
X-Tempemail-Recipients: kavitore4821@mail.example.com
X-Tempemail-Sender: bounce@sender.example
X-Tempemail-Signature: v1=<hex(HMAC_SHA256(secret, timestamp + "\\n" + recipients + "\\n" + sender + "\\n" + sha256_hex(body)))>

<raw RFC 5322 message>`}
            />
          </section>
        </article>
      </div>
    </div>
  );
}
