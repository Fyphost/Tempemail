import { ArrowLeftIcon, InboxIcon } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-muted">
      <header className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-24">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-border bg-white shadow-card">
            <InboxIcon className="size-6 text-primary" aria-hidden />
          </span>
          <p className="mt-6 text-sm font-semibold text-primary">404</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            This page doesn&apos;t exist
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The link may be broken, or the page may have been removed.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild variant="outline">
              <Link href="/">
                <ArrowLeftIcon />
                Home
              </Link>
            </Button>
            <Button asChild>
              <Link href="/app">Open inbox</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
