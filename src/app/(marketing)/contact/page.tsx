import { MailIcon, ShieldAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { ContactForm } from "@/components/marketing/contact-form";
import { PageHeader } from "@/components/marketing/sections";
import { contactTopics, type ContactTopic } from "@/lib/contact";
import { site } from "@/lib/site";
import { getEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with the ${site.name} team, request Premium access or report abuse.`,
  alternates: { canonical: "/contact" },
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const env = getEnv();
  const params = await searchParams;
  const topic = contactTopics.find((value) => value === params.topic) as ContactTopic | undefined;

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="We're happy to help"
        description="Questions, Premium requests or abuse reports. We read every message."
      />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-8">
          <ContactForm defaultTopic={topic} />
        </div>
        <aside className="space-y-4">
          {env.CONTACT_EMAIL ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <MailIcon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-semibold">Email</h2>
              <a
                href={`mailto:${env.CONTACT_EMAIL}`}
                className="mt-1 block text-sm text-primary hover:underline"
              >
                {env.CONTACT_EMAIL}
              </a>
            </div>
          ) : null}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <ShieldAlertIcon className="size-5 text-destructive" aria-hidden />
            <h2 className="mt-3 font-semibold">Report abuse</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              If an address on this service was used for spam, fraud or harassment, choose “Report
              abuse” in the form
              {env.ABUSE_EMAIL ? (
                <>
                  {" "}
                  or write to{" "}
                  <a href={`mailto:${env.ABUSE_EMAIL}`} className="text-primary hover:underline">
                    {env.ABUSE_EMAIL}
                  </a>
                </>
              ) : null}
              . We can block addresses and networks quickly.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted p-5 text-sm leading-relaxed text-muted-foreground">
            We cannot recover expired addresses or deleted messages. They are removed permanently.
          </div>
        </aside>
      </div>
    </>
  );
}
