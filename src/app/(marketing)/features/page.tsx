import {
  ArrowRightIcon,
  BellRingIcon,
  CodeXmlIcon,
  FileWarningIcon,
  GaugeIcon,
  ImageOffIcon,
  KeyRoundIcon,
  LinkIcon,
  RadioIcon,
  ServerIcon,
  ShieldCheckIcon,
  TimerIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FeatureGrid, FinalCta, PageHeader, SectionHeader } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Real-time delivery, sandboxed email rendering, tracking protection, automatic expiration and a developer API. See what the temporary inbox can do.",
  alternates: { canonical: "/features" },
};

const deepDives = [
  {
    eyebrow: "Real-time delivery",
    title: "Messages appear the moment they arrive",
    description:
      "Mail is received by our own SMTP server or a verified inbound provider, parsed, and pushed to your browser over Server-Sent Events. If a network blocks live connections, the inbox switches to adaptive polling without you doing anything.",
    points: [
      { icon: RadioIcon, text: "Live connection with automatic reconnect" },
      {
        icon: GaugeIcon,
        text: "Adaptive polling fallback: every 5 seconds when active, slower when idle",
      },
      { icon: BellRingIcon, text: "Notifications and an unread counter for new mail" },
    ],
  },
  {
    eyebrow: "Safe reading",
    title: "Open any email without worrying about it",
    description:
      "Every message is sanitized when it arrives and again when it is displayed. HTML renders in a sandboxed frame with its own strict security policy, so scripts, forms and embedded content never execute.",
    points: [
      { icon: ShieldCheckIcon, text: "Sanitized HTML in a sandbox without scripts or forms" },
      {
        icon: ImageOffIcon,
        text: "Remote images and tracking pixels blocked until you allow them",
      },
      { icon: LinkIcon, text: "Links open through a page that shows the real destination" },
      { icon: FileWarningIcon, text: "Executables and scripts in attachments are blocked" },
    ],
  },
  {
    eyebrow: "Automatic cleanup",
    title: "Nothing lingers after you're done",
    description:
      "Each address has a visible countdown. When it ends, the address, its messages and attachments are permanently deleted by a scheduled cleanup job. You can extend the lifetime while you still need it, or delete everything yourself at any time.",
    points: [
      { icon: TimerIcon, text: "Visible countdown with one-click extension" },
      { icon: KeyRoundIcon, text: "Unguessable addresses and private session tokens" },
      {
        icon: ServerIcon,
        text: "Only domains with verified MX records and a confirmed test delivery are offered",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Features"
        title="A disposable inbox that takes privacy seriously"
        description="Everything you need to receive email without handing out your real address, plus the safeguards that make it safe to open."
      />

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FeatureGrid />
        </div>
      </section>

      {deepDives.map((section, index) => (
        <section
          key={section.title}
          className={
            index % 2 === 0
              ? "border-t border-border bg-muted py-20"
              : "border-t border-border py-20"
          }
        >
          <div className="mx-auto grid max-w-7xl items-start gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
            <SectionHeader
              align="left"
              eyebrow={section.eyebrow}
              title={section.title}
              description={section.description}
            />
            <ul className="grid gap-3">
              {section.points.map((point) => (
                <li
                  key={point.text}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <point.icon className="size-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="text-sm font-medium text-foreground/90">{point.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="border-t border-border py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <CodeXmlIcon className="size-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Automate it with the API</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Create inboxes, stream delivery events and read messages from your test suite with
                the same API this site uses.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/api-docs">
              API documentation
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
