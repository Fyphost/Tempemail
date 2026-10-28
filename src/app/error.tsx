"use client";

import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="flex min-h-[70vh] items-center justify-center bg-muted px-4 py-24">
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive-soft">
          <TriangleAlertIcon className="size-6 text-destructive" aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again; if it keeps happening, contact us.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcwIcon />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
