import { getEnv } from "@/server/env";

/**
 * Cookie names use the __Host- prefix whenever cookies are Secure, which
 * forces Path=/ and forbids a Domain attribute (no subdomain injection).
 */
export function inboxCookieName(): string {
  return getEnv().cookieSecure ? "__Host-te_inbox" : "te_inbox";
}

export function sessionCookieName(): string {
  return getEnv().cookieSecure ? "__Host-te_session" : "te_session";
}

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  expires: Date;
}

export function secureCookieOptions(expires: Date): CookieOptions {
  return { httpOnly: true, secure: getEnv().cookieSecure, sameSite: "lax", path: "/", expires };
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return undefined;
}

export function bearerToken(headers: Headers): string | undefined {
  const value = headers.get("authorization");
  if (!value) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match?.[1];
}
