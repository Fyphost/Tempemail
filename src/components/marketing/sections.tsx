import {
  ArrowRightIcon,
  BellRingIcon,
  CodeXmlIcon,
  EyeOffIcon,
  FingerprintPatternIcon,
  GlobeIcon,
  HourglassIcon,
  ImageOffIcon,
  KeyRoundIcon,
  LinkIcon,
  MailOpenIcon,
  MousePointerClickIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TrashIcon,
  UserRoundXIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CodeBlock } from "./code-block";

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-blue-100 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <p className="text-sm font-semibold text-primary">{eyebrow}</p> : null}
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-muted">
      <div
        aria-hidden
        className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const features: Feature[] = [
  {
    icon: ZapIcon,
    title: "Instant Temporary Email",
    description:
      "A working address is ready the moment you open the inbox. No forms, no confirmation emails, no waiting.",
  },
  {
    icon: BellRingIcon,
    title: "Real-Time Inbox",
    description:
      "New messages are pushed to your browser over a live connection, with automatic refresh as a fallback.",
  },
  {
    icon: UserRoundXIcon,
    title: "No Registration Required",
    description:
      "Start immediately. Your browser keeps a private session token, so you never hand over personal details.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Privacy Protection",
    description:
      "Emails open in a sandbox where scripts never run, and tracking images stay blocked until you allow them.",
  },
  {
    icon: GlobeIcon,
    title: "Multiple Email Domains",
    description:
      "Pick from every domain we have verified for receiving, and switch domains whenever you create an address.",
  },
  {
    icon: SmartphoneIcon,
    title: "Mobile-Friendly Interface",
    description:
      "A responsive inbox that is as comfortable on a phone as on a desktop, with full keyboard support.",
  },
  {
    icon: HourglassIcon,
    title: "Automatic Email Expiration",
    description:
      "Addresses, messages and attachments delete themselves when the timer ends. Extend it while you need it.",
  },
  {
    icon: CodeXmlIcon,
    title: "Developer API",
    description:
      "Create inboxes and read messages from scripts and test suites with a documented REST API and live events.",
  },
];

export function FeatureGrid({ items = features }: { items?: Feature[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((feature) => (
        <li
          key={feature.title}
          className="group rounded-2xl border border-border bg-card p-6 shadow-soft transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-card"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary transition-colors group-hover:bg-primary group-hover:text-white">
            <feature.icon className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{feature.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {feature.description}
          </p>
        </li>
      ))}
    </ul>
  );
}

const steps = [
  {
    icon: MousePointerClickIcon,
    title: "Generate your temporary email address",
    description:
      "Open the inbox and a random, unguessable address is created for you in under a second.",
  },
  {
    icon: KeyRoundIcon,
    title: "Use it wherever you need to receive an email",
    description:
      "Paste it into a sign-up form, a download page or a free trial instead of your real address.",
  },
  {
    icon: MailOpenIcon,
    title: "Open your temporary inbox and read incoming messages",
    description:
      "Messages appear instantly. Read them safely, copy the code you need, and let the address expire.",
  },
];

export function HowItWorks() {
  return (
    <ol className="relative grid gap-6 lg:grid-cols-3">
      <div
        aria-hidden
        className="absolute top-7 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-blue-100 via-blue-200 to-blue-100 lg:block"
      />
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="relative rounded-2xl border border-border bg-card p-6 text-center shadow-soft"
        >
          <span className="relative mx-auto flex size-14 items-center justify-center rounded-2xl border border-blue-100 bg-white shadow-card">
            <step.icon className="size-6 text-primary" strokeWidth={1.75} aria-hidden />
            <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              {index + 1}
            </span>
          </span>
          <h3 className="mt-5 text-base font-semibold tracking-tight text-balance">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

const privacyPoints: Feature[] = [
  {
    icon: KeyRoundIcon,
    title: "Private by default",
    description:
      "An inbox opens only with its secret session token. Knowing the address is never enough.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Sandboxed rendering",
    description:
      "HTML is sanitized and shown in an isolated frame. Scripts, forms and plugins cannot run.",
  },
  {
    icon: ImageOffIcon,
    title: "Tracking protection",
    description:
      "Remote images and pixels stay blocked until you choose to load them for a message.",
  },
  {
    icon: LinkIcon,
    title: "Safe links",
    description:
      "Links open through a warning page that shows the real destination before you continue.",
  },
  {
    icon: TrashIcon,
    title: "Automatic deletion",
    description:
      "Messages and attachments are permanently removed when the address expires or you delete it.",
  },
  {
    icon: FingerprintPatternIcon,
    title: "Minimal data",
    description:
      "No name, phone number or account needed. IP addresses are kept only as keyed hashes to stop abuse.",
  },
];

export function PrivacyHighlights() {
  return (
    <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="lg:sticky lg:top-28">
        <SectionHeader
          align="left"
          eyebrow="Privacy and security"
          title="Built so a throwaway inbox never becomes a liability"
          description="Disposable email only helps if it is safe to open. Every message passes through the same protections before you see it."
        />
        <div className="mt-8 rounded-2xl border border-amber-200/70 bg-warning-soft p-5 text-sm leading-relaxed text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <EyeOffIcon className="size-4" aria-hidden />
            Know when not to use it
          </p>
          <p className="mt-2 text-amber-900/80">
            Temporary addresses expire and cannot be recovered. Never use one for banking, payments,
            password recovery or any account you need to keep.
          </p>
        </div>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {privacyPoints.map((point) => (
          <li
            key={point.title}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft"
          >
            <point.icon className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
            <h3 className="mt-4 text-[15px] font-semibold">{point.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {point.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ApiPromo({ baseUrl }: { baseUrl: string }) {
  const code = `# 1. Create an inbox (returns the address and a secret token)
curl -s -X POST ${baseUrl}/api/inboxes \\
  -H "Content-Type: application/json" -d '{}'

# 2. Wait for mail in real time (Server-Sent Events)
curl -N ${baseUrl}/api/inboxes/current/events \\
  -H "Authorization: Bearer $TOKEN"

# 3. Read the newest messages
curl -s ${baseUrl}/api/inboxes/current/messages \\
  -H "Authorization: Bearer $TOKEN"`;
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <div>
        <SectionHeader
          align="left"
          eyebrow="Developer API"
          title="Disposable inboxes for your test suites and scripts"
          description="Verify sign-up flows, password resets and notification emails end to end. The same API powers this website, so what you test is what users get."
        />
        <ul className="mt-8 space-y-3 text-sm text-foreground/80">
          {[
            "REST endpoints with consistent JSON responses and error codes",
            "Live delivery events over Server-Sent Events, or simple polling",
            "Sanitized HTML, plain text and attachments for every message",
            "Rate limits and plan limits reported in every response",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-accent">
                <span className="size-1.5 rounded-full bg-primary" />
              </span>
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/api-docs">
              Read the API docs
              <ArrowRightIcon />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/api-docs#quickstart">Quickstart</Link>
          </Button>
        </div>
      </div>
      <CodeBlock code={code} title="terminal" className="shadow-float" />
    </div>
  );
}

export function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-white shadow-float sm:px-12">
        <div
          aria-hidden
          className="absolute inset-0 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px] opacity-[0.12]"
        />
        <div
          aria-hidden
          className="absolute -top-24 left-1/2 size-[480px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Keep your real inbox for the people who matter
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-blue-100">
            Get a private, disposable address in one click. It is free and there is nothing to sign
            up for.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-white text-primary shadow-none hover:bg-blue-50"
            >
              <Link href="/app">
                Generate Free Email
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/features">See all features</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
