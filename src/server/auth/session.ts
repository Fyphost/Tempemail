import "server-only";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import type { AuditActor } from "@/server/audit";
import { clientIpFromHeaders, hashIp } from "@/server/security/ip";

import { inboxCookieName, sessionCookieName } from "./cookies";
import { getUserBySessionToken, type SessionUser } from "./users";

/** Signed-in user for Server Components and Server Actions (null when signed out). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getUserBySessionToken(store.get(sessionCookieName())?.value);
}

export async function requireUser(next = "/account"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/**
 * Administrator gate. Signed-out visitors are sent to the login page;
 * signed-in non-admins get a plain 404 so the admin area is not advertised.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") notFound();
  return user;
}

export async function getRequestIp(): Promise<string> {
  return clientIpFromHeaders(await headers());
}

export async function actorFor(user: SessionUser): Promise<AuditActor> {
  return { userId: user.id, label: user.email, ipHash: hashIp(await getRequestIp()) };
}

export async function currentInboxToken(): Promise<string | undefined> {
  return (await cookies()).get(inboxCookieName())?.value;
}

/** Only allow same-site relative redirect targets ("/path", never "//host"). */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\"))
    return fallback;
  return value;
}
