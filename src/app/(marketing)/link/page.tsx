import { ArrowLeftIcon, ExternalLinkIcon, ShieldAlertIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Leaving the inbox",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function analyse(raw: string | undefined) {
  if (!raw || raw.length > 4_000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const warnings: string[] = [];
  if (url.protocol === "http:")
    warnings.push("This link does not use HTTPS, so the connection is not encrypted.");
  if (url.username || url.password)
    warnings.push(
      "The link contains a username or password, a trick often used to disguise the real site.",
    );
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.startsWith("[")) {
    warnings.push("The link points to a raw IP address instead of a domain name.");
  }
  if (url.hostname.split(".").some((label) => label.startsWith("xn--"))) {
    warnings.push("The domain uses international characters that can imitate a well-known site.");
  }
  return { url, warnings };
}

/**
 * Outbound link interstitial. Links in emails never navigate directly: the
 * reader sees the real destination first and must choose to continue. There
 * is no automatic redirect, so this page cannot be used as an open redirect.
 */
export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = analyse(typeof params.u === "string" ? params.u : undefined);

  return (
    <div className="bg-muted">
      <div className="mx-auto max-w-xl px-4 py-16 sm:py-24">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
          {result ? (
            <>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-warning-soft">
                <ShieldAlertIcon className="size-6 text-warning" aria-hidden />
              </span>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight">
                You are leaving the inbox
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                This link came from an email. Check that you trust the destination before
                continuing, and never enter passwords on a site you reached from an unexpected
                message.
              </p>
              <div className="mt-6 rounded-xl border border-border bg-muted p-4">
                <p className="text-xs font-medium text-muted-foreground">Destination</p>
                <p className="mt-1 text-lg font-semibold break-all text-foreground">
                  {result.url.hostname}
                </p>
                <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
                  {result.url.href}
                </p>
              </div>
              {result.warnings.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {result.warnings.map((warning) => (
                    <li
                      key={warning}
                      className="flex gap-2 rounded-lg border border-amber-200/70 bg-warning-soft px-3 py-2 text-sm text-amber-900"
                    >
                      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button asChild variant="outline">
                  <Link href="/app">
                    <ArrowLeftIcon />
                    Back to inbox
                  </Link>
                </Button>
                <Button asChild>
                  <a
                    href={result.url.href}
                    rel="noopener noreferrer nofollow"
                    referrerPolicy="no-referrer"
                  >
                    Continue to {result.url.hostname.length > 28 ? "site" : result.url.hostname}
                    <ExternalLinkIcon />
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                This link can&apos;t be opened
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Only web links (http and https) from emails can be opened.
              </p>
              <Button asChild variant="outline" className="mt-6">
                <Link href="/app">
                  <ArrowLeftIcon />
                  Back to inbox
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
