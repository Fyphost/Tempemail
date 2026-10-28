import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Prose } from "@/components/marketing/prose";
import { PageHeader } from "@/components/marketing/sections";
import { site } from "@/lib/site";
import { formatDuration } from "@/lib/utils";
import { getEnv } from "@/server/env";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `What ${site.name} stores, for how long, and how temporary inboxes and their messages are deleted.`,
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  await connection();
  const settings = await getSettings();
  const env = getEnv();
  const operator = env.OPERATOR_NAME ?? `the operator of ${site.name}`;
  const contact = env.CONTACT_EMAIL;
  const { free, premium } = settings.plans;
  const { retention } = settings;

  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Privacy policy"
        description={`How ${site.name} handles the little data it needs.`}
      />
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
        <Prose>
          <p>
            This policy explains what information {site.name} (operated by {operator}) processes
            when you use the temporary inbox, the optional accounts and the API. We designed the
            service to work without knowing who you are.
          </p>

          <h2 id="summary">The short version</h2>
          <ul>
            <li>You do not need an account, a name or a phone number to use a temporary inbox.</li>
            <li>
              Messages are deleted automatically when their address expires (by default after{" "}
              {formatDuration(free.inboxTtlMinutes)}), or immediately when you delete them.
            </li>
            <li>We do not use advertising, analytics or third-party tracking cookies.</li>
            <li>
              IP addresses are not stored in plain text. We keep keyed hashes of them to enforce
              rate limits and stop abuse.
            </li>
          </ul>

          <h2 id="inboxes">Temporary inboxes and messages</h2>
          <p>
            When you create an address we store the address, its creation and expiry times, a hash
            of its secret access token and a keyed hash of the IP address that created it. Emails
            sent to the address are stored with their headers of interest, text, sanitized HTML and
            attachments so that you can read them.
          </p>
          <p>
            <strong>Who can read an inbox:</strong> anyone who has the inbox&apos;s secret token.
            Your browser keeps it in an HttpOnly cookie; API clients receive it when they create the
            inbox. Knowing the email address is not enough to open the inbox, but you should treat
            the token like a password and not share it.
          </p>
          <p>
            Addresses expire after their countdown ends: {formatDuration(free.inboxTtlMinutes)} by
            default
            {free.extendMinutes > 0
              ? `, extendable up to ${formatDuration(free.maxLifetimeMinutes)}`
              : ""}{" "}
            on the free plan
            {settings.premiumEnabled
              ? ` and up to ${formatDuration(premium.maxLifetimeMinutes)} on Premium`
              : ""}
            . A cleanup job then permanently deletes the address, every message and every
            attachment. Deleted data cannot be recovered.
          </p>

          <h2 id="delivery">Delivery records</h2>
          <p>
            To process mail reliably we keep a short-lived delivery record for each incoming message
            (recipient address, size, status and the provider that delivered it). The raw message is
            removed from this record as soon as it has been processed. Records of successful
            deliveries are kept for {retention.completedJobsHours} hours to detect duplicates;
            records of failed deliveries, which may still include the raw message for
            troubleshooting, are kept for {retention.failedJobsDays} days.
          </p>

          <h2 id="cookies">Cookies</h2>
          <ul>
            <li>
              <code>te_inbox</code>: the secret token of your current temporary inbox. Strictly
              necessary; expires with the inbox.
            </li>
            <li>
              <code>te_session</code>: set only if you sign in to an account. Strictly necessary;
              expires after 7 days or when you sign out.
            </li>
          </ul>
          <p>Both cookies are HttpOnly and cannot be read by scripts. We set no other cookies.</p>

          <h2 id="accounts">Optional accounts and API keys</h2>
          <p>
            If you create an account we store your email address, a salted scrypt hash of your
            password, your plan and the time of your last sign-in. API keys are stored only as
            hashes; the full key is shown to you once. Account data is kept until you ask us to
            delete the account.
          </p>

          <h2 id="security-logs">Security and abuse prevention</h2>
          <p>
            We record security-relevant events, such as failed sign-ins, administrative changes and
            rejected webhook deliveries, with a keyed hash of the IP address. These logs are kept
            for {retention.auditLogDays} days. Rate-limit counters are discarded after one day.
          </p>

          <h2 id="contact-requests">Contact requests</h2>
          <p>
            Messages sent through the contact form, including the email address you give us, are
            kept for {retention.contactRequestsDays} days so we can respond and follow up on abuse
            reports.
          </p>

          <h2 id="processors">Service providers</h2>
          <p>
            Incoming email may pass through an inbound email provider or edge network configured by
            the operator before it reaches our servers. Our hosting provider and reverse proxy may
            keep standard connection logs according to their own configuration. We do not sell or
            share message contents with anyone.
          </p>

          <h2 id="protection">How messages are protected</h2>
          <p>
            HTML emails are sanitized and shown in a sandboxed frame without scripts. Remote images
            are blocked until you choose to load them, because loading them tells the sender that
            you opened the message and reveals your IP address to them. Links open through a page
            that shows their real destination.
          </p>

          <h2 id="choices">Your choices</h2>
          <ul>
            <li>
              Delete a single message, or the whole address with all of its messages, at any time
              from the inbox.
            </li>
            <li>Sign out to end an account session, and revoke API keys from your account page.</li>
            <li>
              Ask for your account to be deleted, or ask questions about this policy, through the{" "}
              <Link href="/contact">contact page</Link>
              {contact ? (
                <>
                  {" "}
                  or by email at <a href={`mailto:${contact}`}>{contact}</a>
                </>
              ) : null}
              .
            </li>
          </ul>

          <h2 id="warning">Important limitation</h2>
          <p>
            Temporary addresses are meant for low-value, short-term use. Do not use them for
            banking, payments, government services, password recovery or any account you need to
            keep. When an address expires, mail sent to it is rejected and any account tied to it
            may become unrecoverable.
          </p>

          <h2 id="changes">Changes</h2>
          <p>
            We will update this page when our practices change. Retention periods shown here reflect
            the current configuration.
          </p>
        </Prose>
      </div>
    </>
  );
}
