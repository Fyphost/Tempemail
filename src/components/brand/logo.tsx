import Link from "next/link";

import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" fill="#2563EB" />
      <rect x="6.5" y="9" width="19" height="14" rx="3" fill="none" stroke="#fff" strokeWidth="2" />
      <path
        d="M8 11.25l8 5.5 8-5.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="22.5" r="6.25" fill="#2563EB" />
      <circle cx="24" cy="22.5" r="4.75" fill="#fff" />
      <path
        d="M24 20.2v2.5l1.6 1"
        fill="none"
        stroke="#2563EB"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg text-[17px] font-semibold tracking-tight text-foreground",
        className,
      )}
      aria-label={`${site.name} home`}
    >
      <LogoMark />
      <span>{site.name}</span>
    </Link>
  );
}
