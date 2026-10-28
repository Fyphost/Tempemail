"use client";

import { ArrowRightIcon, MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/controls";
import { mainNav, site } from "@/lib/site";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b bg-white/85 backdrop-blur-md transition-[border-color,box-shadow] supports-[backdrop-filter]:bg-white/75",
        scrolled ? "border-border shadow-[0_1px_0_rgb(15_23_42/0.02)]" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                isActive(pathname, item.href) && "text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost" size="sm" className="h-9 px-3 text-sm">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button asChild size="sm" className="h-9 px-4 text-sm">
            <Link href="/app">
              Create Email
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className="ml-auto lg:hidden"
              aria-label="Open menu"
            >
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-0">
            <div className="border-b border-border px-5 py-4">
              <SheetTitle className="text-base font-semibold">{site.name}</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                Disposable email in seconds
              </SheetDescription>
            </div>
            <nav aria-label="Mobile" className="flex flex-col gap-1 px-3">
              {mainNav.map((item) => (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className={cn(
                      "rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground/80 hover:bg-secondary",
                      isActive(pathname, item.href) && "bg-accent text-accent-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
              <SheetClose asChild>
                <Link
                  href="/pricing"
                  className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground/80 hover:bg-secondary"
                >
                  Plans
                </Link>
              </SheetClose>
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
              <SheetClose asChild>
                <Button asChild variant="outline">
                  <Link href="/login">Sign In</Link>
                </Button>
              </SheetClose>
              <SheetClose asChild>
                <Button asChild>
                  <Link href="/app">Create Email</Link>
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
