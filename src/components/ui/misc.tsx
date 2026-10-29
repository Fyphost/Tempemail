import * as React from "react";

import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-slate-100", className)}
      {...props}
    />
  );
}

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Small pulsing status dot. */
function StatusDot({
  tone = "success",
  pulse = false,
}: {
  tone?: "success" | "warning" | "muted" | "destructive";
  pulse?: boolean;
}) {
  const color = {
    success: "bg-success",
    warning: "bg-amber-500",
    muted: "bg-slate-400",
    destructive: "bg-destructive",
  }[tone];
  return (
    <span className="relative inline-flex size-2">
      {pulse ? (
        <span
          className={cn("absolute inline-flex size-full animate-pulse-ring rounded-full", color)}
        />
      ) : null}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}

export { Kbd, Separator, Skeleton, StatusDot };
