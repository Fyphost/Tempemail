import { cn } from "@/lib/utils";

/** Typography wrapper for long-form legal and help content. */
export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-none text-[15px] leading-relaxed text-foreground/85",
        "[&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground",
        "[&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_li]:pl-1 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
