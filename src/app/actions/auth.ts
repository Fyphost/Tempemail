"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAudit } from "@/server/audit";
import { secureCookieOptions, sessionCookieName } from "@/server/auth/cookies";
import { safeNextPath } from "@/server/auth/session";
import {
  authenticateUser,
  createUser,
  createUserSession,
  revokeUserSession,
} from "@/server/auth/users";
import { errors } from "@/server/http/errors";
import { clientIpFromHeaders, hashIp } from "@/server/security/ip";
import { assertIpNotBlocked, enforceRateLimit } from "@/server/security/rate-limit";
import { sha256Hex } from "@/server/security/crypto";
import { getSettings } from "@/server/settings";

import { runAction, type ActionResult } from "./result";

const credentials = z.object({
  email: z.email("Enter a valid email address.").max(320),
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().max(500).optional(),
});

async function requestContext() {
  const headerList = await headers();
  const ip = clientIpFromHeaders(headerList);
  return { ipHash: hashIp(ip), userAgent: headerList.get("user-agent") };
}

async function startSession(userId: string, context: { ipHash: string; userAgent: string | null }) {
  const session = await createUserSession(userId, context);
  (await cookies()).set(sessionCookieName(), session.token, secureCookieOptions(session.expiresAt));
}

export async function signInAction(
  input: z.input<typeof credentials>,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = credentials.safeParse(input);
    if (!parsed.success)
      throw errors.badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
    const context = await requestContext();
    const settings = await getSettings();
    await assertIpNotBlocked(context.ipHash);
    const limit = settings.rateLimits.loginAttemptsPer15Minutes;
    const message = "Too many sign-in attempts. Please wait a few minutes and try again.";
    await enforceRateLimit("login.ip", context.ipHash, limit * 3, 900, message);
    await enforceRateLimit(
      "login.email",
      sha256Hex(parsed.data.email.toLowerCase()).slice(0, 32),
      limit,
      900,
      message,
    );

    const user = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!user) {
      await writeAudit(
        { userId: null, label: "anonymous", ipHash: context.ipHash },
        "auth.login_failed",
        {
          type: "user",
          id: parsed.data.email.toLowerCase(),
        },
      );
      throw errors.unauthorized("The email or password is incorrect.");
    }
    await startSession(user.id, context);
    await writeAudit({ userId: user.id, label: user.email, ipHash: context.ipHash }, "auth.login", {
      type: "user",
      id: user.id,
    });
    const fallback = user.role === "admin" ? "/admin" : "/account";
    return { redirectTo: safeNextPath(parsed.data.next, fallback) };
  });
}

const registration = z.object({
  email: z.email("Enter a valid email address.").max(320),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

export async function registerAction(
  input: z.input<typeof registration>,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const settings = await getSettings();
    if (!settings.registrationEnabled) throw errors.forbidden("Registration is currently closed.");
    const parsed = registration.safeParse(input);
    if (!parsed.success)
      throw errors.badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
    const context = await requestContext();
    await assertIpNotBlocked(context.ipHash);
    await enforceRateLimit(
      "register.ip",
      context.ipHash,
      5,
      3600,
      "Too many accounts were created from your network recently.",
    );
    const user = await createUser(
      { email: parsed.data.email, password: parsed.data.password },
      { userId: null, label: "self-registration", ipHash: context.ipHash },
    );
    await startSession(user.id, context);
    return { redirectTo: "/account" };
  });
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  await revokeUserSession(store.get(sessionCookieName())?.value);
  store.set(sessionCookieName(), "", { ...secureCookieOptions(new Date(0)), maxAge: 0 });
  redirect("/login");
}
