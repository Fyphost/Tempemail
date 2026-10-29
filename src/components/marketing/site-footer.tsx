import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import { footerNav, site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-tight"
            >
              <LogoMark />
              {site.name}
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Temporary inboxes for sign-ups, downloads and trials. Messages arrive in real time and
              are deleted automatically when the address expires.
            </p>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Not for banking, password recovery or any account you need to keep. Disposable inboxes
              expire and cannot be recovered.
            </p>
          </div>
          {Object.entries(footerNav).map(([heading, links]) => (
            <div key={heading}>
              <h2 className="text-sm font-semibold text-foreground">{heading}</h2>
              <ul className="mt-4 space-y-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <p>
            Questions or abuse reports?{" "}
            <Link href="/contact" className="font-medium text-foreground hover:text-primary">
              Contact us
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
