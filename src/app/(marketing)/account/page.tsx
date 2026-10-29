import { connection } from "next/server";
import { LogOutIcon, ShieldIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";
import { ApiKeys, OwnedInboxes, PasswordForm } from "@/components/account/account-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import { listApiKeys } from "@/server/auth/api-keys";
import { requireUser } from "@/server/auth/session";
import { listUserInboxes } from "@/server/inboxes/service";
import { effectivePlan, getSettings, limitsFor } from "@/server/settings";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  await connection();
  const user = await requireUser("/account");
  const settings = await getSettings();
  const plan = effectivePlan(user.plan, settings);
  const limits = limitsFor(plan, settings);
  const [inboxes, keys] = await Promise.all([listUserInboxes(user.id), listApiKeys(user.id)]);

  const keysAllowed = settings.api.enabled && settings.api.keysEnabled && limits.apiKeys;
  const keysReason =
    !settings.api.enabled || !settings.api.keysEnabled
      ? "API keys are not available on this service right now."
      : !limits.apiKeys
        ? "API keys are included with Premium. Contact us if you need programmatic access."
        : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex gap-2">
          {user.role === "admin" ? (
            <Button asChild variant="outline">
              <Link href="/admin">
                <ShieldIcon />
                Admin dashboard
              </Link>
            </Button>
          ) : null}
          <form action={signOutAction}>
            <Button type="submit" variant="ghost">
              <LogOutIcon />
              Sign out
            </Button>
          </form>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Plan
            <Badge variant={plan === "premium" ? "info" : "secondary"}>
              {plan === "premium" ? "Premium" : "Free"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Limits currently applied to addresses you create while signed in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-4">
            {[
              ["Active addresses", `${inboxes.length} of ${limits.maxConcurrentInboxes}`],
              ["Default lifetime", formatDuration(limits.inboxTtlMinutes)],
              ["Maximum lifetime", formatDuration(limits.maxLifetimeMinutes)],
              ["Messages per address", String(limits.maxMessagesPerInbox)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-muted p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
          <CardDescription>Active addresses owned by your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <OwnedInboxes
            inboxes={inboxes.map(({ inbox }) => ({
              id: inbox.publicId,
              address: inbox.address,
              expiresAt: inbox.expiresAt.toISOString(),
              messageCount: inbox.messageCount,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Use a key as <code className="font-mono">Authorization: Bearer tek_…</code> to create
            addresses owned by this account. See the{" "}
            <Link href="/api-docs#authentication" className="text-primary hover:underline">
              API docs
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeys keys={keys} allowed={keysAllowed} reason={keysReason} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Use a long, unique password.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
