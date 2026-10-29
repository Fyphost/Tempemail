/**
 * Development helper: deliver a real message to the local SMTP server.
 *
 *   npm run test:smtp -- --to someone@your-domain.test [--subject "Hi"] [--port 2525]
 *
 * The message travels through the normal pipeline (SMTP → queue → parser →
 * inbox), so it is a genuine end-to-end check, not a fabricated message.
 * Sending to a domain's verification probe address completes the
 * "test delivery" step for that domain.
 */
import { parseArgs } from "node:util";

import nodemailer from "nodemailer";

const { values } = parseArgs({
  options: {
    to: { type: "string" },
    from: { type: "string", default: "Local Test <test@example.org>" },
    subject: { type: "string", default: "Test message" },
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: process.env.SMTP_PORT ?? "2525" },
    text: { type: "string" },
  },
});

if (!values.to) {
  console.error("Usage: npm run test:smtp -- --to <address> [--subject <subject>] [--port <port>]");
  process.exit(1);
}

async function main(): Promise<void> {
  const transport = nodemailer.createTransport({
    host: values.host,
    port: Number(values.port),
    secure: false,
    ignoreTLS: true,
  });

  const sentAt = new Date().toISOString();
  const info = await transport.sendMail({
    from: values.from,
    to: values.to,
    subject: values.subject,
    text: values.text ?? `This is a test message sent at ${sentAt} through the local SMTP server.`,
    html:
      values.text === undefined
        ? `<div style="font-family:Arial,sans-serif;color:#0f172a"><h2 style="color:#2563eb">Delivery test</h2><p>This message was sent at <strong>${sentAt}</strong> through the local SMTP server.</p></div>`
        : undefined,
  });
  console.log(`Accepted by SMTP server: ${info.accepted.join(", ")} (${info.response})`);
  transport.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
