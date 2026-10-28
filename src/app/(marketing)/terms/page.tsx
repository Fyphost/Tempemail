import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Prose } from "@/components/marketing/prose";
import { PageHeader } from "@/components/marketing/sections";
import { site } from "@/lib/site";
import { getEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Terms of service",
  description: `The rules for using ${site.name}, including acceptable use and the limits of a disposable inbox.`,
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  await connection();
  const env = getEnv();
  const operator = env.OPERATOR_NAME ?? `the operator of ${site.name}`;
  const abuse = env.ABUSE_EMAIL ?? env.CONTACT_EMAIL;

  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Terms of service"
        description="Please read these terms before using the service."
      />
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
        <Prose>
          <p>
            These terms govern your use of {site.name}, provided by {operator}. By creating an
            address, using the API or creating an account you agree to them. If you do not agree, do
            not use the service.
          </p>

          <h2 id="service">1. The service</h2>
          <p>
            {site.name} provides temporary, receive-only email addresses. Addresses and their
            messages are deleted automatically when they expire and cannot be restored. Sending
            email from an address is not supported.
          </p>

          <h2 id="not-for">2. What the service is not for</h2>
          <p>
            A temporary inbox is not a replacement for a personal email account. Do not use it for
            banking, payments, government or medical services, password recovery, two-factor
            authentication, or any account you need to keep access to. You accept that anything tied
            to a temporary address may become inaccessible once it expires.
          </p>

          <h2 id="access">3. Access to inboxes</h2>
          <p>
            An inbox can be opened by anyone who holds its secret token. Keep your browser session
            and any API token private. We are not responsible for access gained through a token you
            shared or exposed.
          </p>

          <h2 id="acceptable-use">4. Acceptable use</h2>
          <p>You must not use the service to:</p>
          <ul>
            <li>break the law, or help anyone else do so;</li>
            <li>
              commit fraud, impersonate others, or open accounts to abuse promotions, trials or
              other services;
            </li>
            <li>
              harass, threaten or exploit anyone, or receive content that is illegal to possess;
            </li>
            <li>
              attempt to read inboxes that are not yours, or probe, scan or attack the service;
            </li>
            <li>
              bypass rate limits, plan limits or blocks, for example by automating address creation
              at scale;
            </li>
            <li>overload the service or interfere with other users.</li>
          </ul>
          <p>
            We may block networks, disable accounts, delete addresses and refuse mail to stop abuse,
            without prior notice. Report abuse through the <Link href="/contact">contact page</Link>
            {abuse ? (
              <>
                {" "}
                or by email at <a href={`mailto:${abuse}`}>{abuse}</a>
              </>
            ) : null}
            .
          </p>

          <h2 id="api">5. API use</h2>
          <p>
            The API may be used within the published rate limits. API keys are personal to the
            account that created them. We may change or revoke API access to protect the service.
          </p>

          <h2 id="accounts">6. Accounts and plans</h2>
          <p>
            Accounts are optional. Plan features and limits are described on the{" "}
            <Link href="/pricing">plans page</Link> and may change. Premium access, where offered,
            is arranged directly with us; there is no automatic billing.
          </p>

          <h2 id="content">7. Content</h2>
          <p>
            Messages are sent by third parties. We do not review, endorse or take responsibility for
            their content, links or attachments. Dangerous attachments are blocked as a precaution,
            but you open content at your own risk.
          </p>

          <h2 id="warranty">8. No warranty</h2>
          <p>
            The service is provided “as is” and “as available”. Email delivery depends on systems
            outside our control, so messages can be delayed, rejected or lost. We do not guarantee
            availability or that any particular message will be received.
          </p>

          <h2 id="liability">9. Limitation of liability</h2>
          <p>
            To the extent permitted by law, we are not liable for indirect or consequential damages,
            or for loss of data, access or accounts resulting from the expiry or deletion of a
            temporary address.
          </p>

          <h2 id="changes">10. Changes</h2>
          <p>
            We may update these terms. Continued use after an update means you accept the revised
            terms.
          </p>
        </Prose>
      </div>
    </>
  );
}
