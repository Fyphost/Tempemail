import type { NextRequest, NextResponse } from "next/server";

import { ApiError, errors } from "@/server/http/errors";
import { assertSameOrigin, isUnsafeMethod } from "@/server/http/request";
import { findInboxByToken, type InboxWithDomain } from "@/server/inboxes/service";
import type { SystemSettings } from "@/server/settings";

import { authenticateApiKey } from "./api-keys";
import {
  bearerToken,
  inboxCookieName,
  readCookie,
  secureCookieOptions,
  sessionCookieName,
} from "./cookies";
import { getUserBySessionToken, type SessionUser } from "./users";

export type CredentialSource = "bearer" | "cookie";

export interface InboxAccess extends InboxWithDomain {
  via: CredentialSource;
  tokenId: string;
}

/**
 * Authorize access to "the current inbox". Possession of the secret inbox
 * token (Authorization: Bearer tei_…, or the HttpOnly session cookie) is the
 * only proof of ownership. Knowing the email address grants nothing.
 */
export async function requireInbox(
  request: NextRequest,
  settings: SystemSettings,
  options: { allowExpired?: boolean } = {},
): Promise<InboxAccess> {
  const bearer = bearerToken(request.headers);
  let token: string | undefined;
  let via: CredentialSource;
  if (bearer) {
    if (!bearer.startsWith("tei_")) {
      throw errors.unauthorized(
        "Use the inbox token (tei_…) returned by POST /api/inboxes for this endpoint.",
      );
    }
    if (!settings.api.enabled)
      throw errors.forbidden("Programmatic API access is disabled on this service.");
    token = bearer;
    via = "bearer";
  } else {
    token = readCookie(request.headers.get("cookie"), inboxCookieName());
    via = "cookie";
    if (token && isUnsafeMethod(request.method)) assertSameOrigin(request);
  }
  if (!token) throw errors.unauthorized("There is no active inbox for this session.");
  const found = await findInboxByToken(token);
  if (!found) throw errors.unauthorized("This inbox session is invalid or has been deleted.");
  if (found.expired && !options.allowExpired) {
    throw new ApiError(
      410,
      "inbox_expired",
      "This address has expired and its messages have been deleted.",
    );
  }
  return { inbox: found.inbox, domain: found.domain, via, tokenId: found.tokenId };
}

export interface Principal {
  user: SessionUser | null;
  via: "api_key" | "session" | "anonymous";
}

/** Who is creating something: an API key holder, a signed-in user, or an anonymous visitor. */
export async function resolvePrincipal(
  request: NextRequest,
  settings: SystemSettings,
): Promise<Principal> {
  const bearer = bearerToken(request.headers);
  if (bearer?.startsWith("tek_")) {
    if (!settings.api.enabled)
      throw errors.forbidden("Programmatic API access is disabled on this service.");
    const { user } = await authenticateApiKey(bearer);
    return { user, via: "api_key" };
  }
  if (bearer && !bearer.startsWith("tei_")) throw errors.unauthorized("Unrecognised bearer token.");
  if (bearer && !settings.api.enabled) {
    throw errors.forbidden("Programmatic API access is disabled on this service.");
  }
  const session = readCookie(request.headers.get("cookie"), sessionCookieName());
  if (session) {
    const user = await getUserBySessionToken(session);
    if (user) return { user, via: "session" };
  }
  return { user: null, via: "anonymous" };
}

export function setInboxCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(inboxCookieName(), token, secureCookieOptions(expiresAt));
}

export function clearInboxCookie(response: NextResponse): void {
  response.cookies.set(inboxCookieName(), "", { ...secureCookieOptions(new Date(0)), maxAge: 0 });
}

export function currentInboxCookieToken(request: NextRequest): string | undefined {
  return readCookie(request.headers.get("cookie"), inboxCookieName());
}
