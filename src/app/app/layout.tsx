import type { Metadata } from "next";

import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: "Temporary inbox",
  description:
    "Your disposable inbox. Copy the address, receive email in real time, and let it expire automatically.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/app" },
};

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted lg:h-dvh">
      <SiteHeader />
      <main id="main" className="flex-1 lg:min-h-0">
        {children}
      </main>
    </div>
  );
}
