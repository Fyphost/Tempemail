"use client";

import { CheckIcon, CopyIcon } from "lucide-react";

import { useCopy } from "@/components/inbox/hooks";
import { cn } from "@/lib/utils";

export function CodeBlock({
  code,
  title,
  className,
  tone = "dark",
}: {
  code: string;
  title?: string;
  className?: string;
  tone?: "dark" | "light";
}) {
  const { copied, copy } = useCopy();
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border",
        dark
          ? "border-slate-800 bg-slate-950 text-slate-100"
          : "border-border bg-muted text-foreground",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b px-4 py-2 text-xs",
          dark ? "border-slate-800 text-slate-400" : "border-border text-muted-foreground",
        )}
      >
        <span className="truncate font-medium">{title ?? "Example"}</span>
        <button
          type="button"
          onClick={() => void copy(code)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
            dark
              ? "hover:bg-slate-800 hover:text-white"
              : "hover:bg-secondary hover:text-foreground",
          )}
          aria-label="Copy code"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
