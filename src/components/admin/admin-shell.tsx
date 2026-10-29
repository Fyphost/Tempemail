"use client";

import {
  ActivityIcon,
  BanIcon,
  ExternalLinkIcon,
  GaugeIcon,
  GlobeIcon,
  InboxIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/controls";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin", label: "Overview", icon: GaugeIcon },
  { href: "/admin/domains", label: "Domains", icon: GlobeIcon },
  { href: "/admin/inboxes", label: "Inboxes", icon: InboxIcon },
  { href: "/admin/processing", label: "Email processing", icon: ActivityIcon },
  { href: "/admin/abuse", label: "Abuse & blocks", icon: BanIcon },
  { href: "/admin/users", label: "Users", icon: UsersIcon },
  { href: "/admin/messages", label: "Contact requests", icon: MessageSquareIcon },
  { href: "/admin/audit", label: "Audit log", icon: ScrollTextIcon },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

function NavLinks({ onNavigate }: { onNavigate?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const link = (
          <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-foreground/75 hover:bg-secondary hover:text-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
        return onNavigate ? (
          <SheetClose asChild key={item.href}>
            {link}
          </SheetClose>
        ) : (
          <span key={item.href}>{link}</span>
        );
      })}
    </nav>
  );
}

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-background lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <LogoMark />
          <span className="font-semibold tracking-tight">Admin</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks />
        </div>
        <div className="border-t border-border p-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ExternalLinkIcon className="size-4" aria-hidden />
            View site
          </Link>
          <p className="truncate px-3 pt-2 text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <form action={signOutAction} className="px-1 pt-1">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
            >
              <LogOutIcon />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Open admin menu">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-3 pt-14">
              <SheetTitle className="sr-only">Administration</SheetTitle>
              <NavLinks onNavigate />
            </SheetContent>
          </Sheet>
          <LogoMark className="size-7" />
          <span className="font-semibold">Admin</span>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
