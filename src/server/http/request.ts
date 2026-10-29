import type { NextRequest } from "next/server";
import type { z } from "zod";

import { getEnv } from "@/server/env";

import { errors, validationError } from "./errors";

/** Read a request body into memory, refusing anything larger than `maxBytes`. */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) throw errors.payloadTooLarge();
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw errors.payloadTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = 64 * 1024,
): Promise<z.infer<S>> {
  const raw = await readBodyLimited(request, maxBytes);
  let json: unknown = {};
  if (raw.length > 0) {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw errors.unsupportedMediaType("Send JSON with Content-Type: application/json.");
    }
    try {
      json = JSON.parse(raw.toString("utf8"));
    } catch {
      throw errors.badRequest("The request body is not valid JSON.");
    }
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export function parseQuery<S extends z.ZodType>(request: NextRequest, schema: S): z.infer<S> {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function requestHostOrigin(request: Request): string | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  const proto =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests.
 * Browsers always send Origin on cross-site non-GET requests, so a mismatching
 * Origin is rejected. Requests without browser fetch metadata (curl, SDKs)
 * carry no ambient credentials and are allowed.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = new Set([getEnv().appOrigin]);
    const hostOrigin = requestHostOrigin(request);
    if (hostOrigin) allowed.add(hostOrigin);
    if (!allowed.has(origin)) throw errors.forbidden("Cross-site request rejected.");
    return;
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw errors.forbidden("Cross-site request rejected.");
  }
}

export function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}
