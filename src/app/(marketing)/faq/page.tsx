import type { Metadata } from "next";
import Link from "next/link";

import { FaqList } from "@/components/marketing/faq-list";
import { PageHeader } from "@/components/marketing/sections";
import { faq, type FaqItem } from "@/lib/faq";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    "How temporary email addresses work, how long they last, who can read them, what is blocked for your safety, and when not to use a disposable inbox.",
  alternates: { canonical: "/faq" },
};

const categories: FaqItem["category"][] = ["Basics", "Privacy & security", "Limits", "Developers"];

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <PageHeader
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="Everything you need to know about temporary inboxes on this service."
      />
      <div className="mx-auto max-w-3xl space-y-12 px-4 py-16 sm:px-6 lg:px-8">
        {categories.map((category) => (
          <section key={category} aria-labelledby={`faq-${category}`}>
            <h2 id={`faq-${category}`} className="mb-4 text-lg font-semibold tracking-tight">
              {category}
            </h2>
            <FaqList items={faq.filter((item) => item.category === category)} />
          </section>
        ))}
        <p className="rounded-2xl border border-border bg-muted p-6 text-sm text-muted-foreground">
          Still have a question?{" "}
          <Link href="/contact" className="font-medium text-primary hover:text-primary-strong">
            Get in touch
          </Link>{" "}
          or read the{" "}
          <Link href="/privacy" className="font-medium text-primary hover:text-primary-strong">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </>
  );
}
