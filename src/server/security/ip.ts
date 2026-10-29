import { isIP } from "node:net";

import { getEnv } from "@/server/env";

import { hmacSha256Hex } from "./crypto";

/**
 * Resolve the client IP from X-Forwarded-For, trusting exactly
 * TRUST_PROXY_HOPS reverse proxies. With 0 hops the left-most value is used,
 * which is only safe when Next.js is reached directly (it then sets the header
 * from the socket address). Production deployments should run behind a proxy
 * and set TRUST_PROXY_HOPS=1 (or the number of proxies in front of the app).
 */
export function clientIpFromHeaders(
  headers: Headers,
  trustedHops = getEnv().TRUST_PROXY_HOPS,
): string {
  const forwarded = headers.get("x-forwarded-for");
  const chain = (forwarded ?? "")
    .split(",")
    .map((part) => normalizeIp(part.trim()))
    .filter((part): part is string => Boolean(part));

  if (chain.length === 0) {
    const realIp = normalizeIp(headers.get("x-real-ip") ?? "");
    return realIp ?? "0.0.0.0";
  }
  if (trustedHops <= 0) return chain[0]!;
  const index = Math.max(0, chain.length - trustedHops);
  return chain[index] ?? chain[0]!;
}

export function normalizeIp(value: string): string | null {
  let ip = value.trim();
  if (!ip) return null;
  // Strip brackets and ports: "[::1]:1234", "1.2.3.4:5678".
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    if (end > 0) ip = ip.slice(1, end);
  } else if (ip.includes(".") && ip.includes(":") && ip.indexOf(":") === ip.lastIndexOf(":")) {
    ip = ip.slice(0, ip.indexOf(":"));
  }
  if (ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4) {
    ip = ip.slice(7);
  }
  return isIP(ip) ? ip.toLowerCase() : null;
}

function expandIpv6(ip: string): string[] {
  const [head = "", tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = ip.includes("::") ? 8 - headParts.length - tailParts.length : 0;
  return [...headParts, ...Array(Math.max(0, missing)).fill("0"), ...tailParts].map((part) =>
    part.padStart(4, "0"),
  );
}

/**
 * Subject used for rate limiting: full address for IPv4, /64 network for IPv6
 * (a single subscriber normally controls a whole /64).
 */
export function rateLimitSubject(ip: string): string {
  if (isIP(ip) === 6) {
    return `${expandIpv6(ip).slice(0, 4).join(":")}::/64`;
  }
  return ip;
}

/** Keyed hash so raw IP addresses never need to be stored. */
export function hashIp(ip: string): string {
  return hmacSha256Hex(getEnv().SESSION_SECRET, `ip:${rateLimitSubject(ip)}`).slice(0, 32);
}

/** Coarse, human-readable label (e.g. "203.0.113.x") for admin screens. */
export function maskIp(ip: string): string {
  if (isIP(ip) === 4) {
    const parts = ip.split(".");
    return `${parts.slice(0, 3).join(".")}.x`;
  }
  if (isIP(ip) === 6) {
    return `${expandIpv6(ip).slice(0, 3).join(":")}::/48`;
  }
  return "unknown";
}
