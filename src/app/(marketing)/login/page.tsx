import { connection } from "next/server";
import { ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { LogoMark } from "@/components/brand/logo";
import { getSessionUser, safeNextPath } from "@/server/auth/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to manage several addresses, API keys and your plan. The temporary inbox itself never requires an account.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const next =
    typeof params.next === "string" ? safeNextPath(params.next, "") || undefined : undefined;
  const user = await getSessionUser();
  if (user) redirect(next ?? (user.role === "admin" ? "/admin" : "/account"));
  const settings = await getSettings();

  return (
    <div className="relative overflow-hidden bg-muted">
      <div
        aria-hidden
        className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div className="relative mx-auto flex max-w-md flex-col px-4 py-16 sm:py-24">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
          <LogoMark className="size-10" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            {settings.registrationEnabled ? "Sign in or create an account" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Accounts are optional. Use one to keep several addresses and API keys in one place.
          </p>
          <div className="mt-8">
            <LoginForm registrationEnabled={settings.registrationEnabled} next={next} />
          </div>
          {!settings.registrationEnabled ? (
            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              New registrations are currently closed. Accounts are created by the service
              administrator.
            </p>
          ) : null}
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <ShieldCheckIcon className="size-4 text-success" aria-hidden />
          Just need an address?{" "}
          <Link href="/app" className="font-medium text-primary hover:text-primary-strong">
            No account required
          </Link>
        </p>
      </div>
    </div>
  );
}
