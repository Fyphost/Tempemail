import { ArrowRightIcon, CheckIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FaqList } from "@/components/marketing/faq-list";
import { HeroInboxPreview } from "@/components/marketing/hero-preview";
import {
  ApiPromo,
  Eyebrow,
  FeatureGrid,
  FinalCta,
  HowItWorks,
  PrivacyHighlights,
  SectionHeader,
} from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { faq } from "@/lib/faq";
import { site, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `${site.name} — Free temporary email address in seconds` },
  description:
    "Create a disposable email address instantly. Receive real emails in your browser in real time, protect your personal inbox, and let everything delete itself automatically.",
  alternates: { canonical: "/" },
};

function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: site.name,
    url: siteUrl(),
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    description: site.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  return (
    <script
      type="application/ld+json"
      // Static, server-generated JSON (no user input).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export default function HomePage() {
  return (
    <>
      <JsonLd />
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:pt-24 lg:pb-28">
          <div>
            <Eyebrow>
              <SparklesIcon className="size-3.5" aria-hidden />
              Free disposable inboxes · No sign-up
            </Eyebrow>
            <h1 className="mt-6 text-[2.6rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-[4.1rem]">
              <span className="block">Your Inbox.</span>
              <span className="block">Your Privacy.</span>
              <span className="block text-primary">Zero Hassle.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
              Create a temporary email address in seconds. Receive emails instantly, protect your
              personal inbox, and stay in control of your privacy.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/app">
                  Generate Free Email
                  <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/features">Explore Features</Link>
              </Button>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
              {["No registration", "Real-time delivery", "Deletes itself automatically"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-success-soft">
                      <CheckIcon className="size-3 text-success" aria-hidden />
                    </span>
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>
          <div className="animate-fade-up">
            <HeroInboxPreview />
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-t border-border bg-muted py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Features"
            title="Everything a disposable inbox should do, and nothing it shouldn't"
            description="Fast to start, pleasant to use and careful with your privacy from the first message to automatic deletion."
          />
          <div className="mt-14">
            <FeatureGrid />
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="How it works"
            title="Three steps, about ten seconds"
            description="No setup and nothing to install. The inbox works in any modern browser."
          />
          <div className="mt-14">
            <HowItWorks />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <PrivacyHighlights />
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ApiPromo baseUrl={siteUrl()} />
        </div>
      </section>

      <section className="border-t border-border py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <SectionHeader
              align="left"
              eyebrow="FAQ"
              title="Questions, answered"
              description="The short version of how temporary inboxes work here."
            />
            <Button asChild variant="outline" className="mt-8">
              <Link href="/faq">
                View all questions
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
          <FaqList items={faq.slice(0, 6)} />
        </div>
      </section>

      <FinalCta />
    </>
  );
}
