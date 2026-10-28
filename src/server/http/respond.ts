import { NextResponse } from "next/server";

import { logger } from "@/server/logger";

import { ApiError } from "./errors";

const NO_STORE = "private, no-store, max-age=0";

export function ok<T>(data: T, init: ResponseInit = {}): NextResponse {
  const response = NextResponse.json({ data }, init);
  if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", NO_STORE);
  return response;
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": NO_STORE } });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    const body: { error: { code: string; message: string; details?: unknown } } = {
      error: { code: error.code, message: error.message },
    };
    if (error.details !== undefined) body.error.details = error.details;
    const response = NextResponse.json(body, { status: error.status });
    response.headers.set("Cache-Control", NO_STORE);
    for (const [key, value] of Object.entries(error.headers ?? {})) {
      response.headers.set(key, value);
    }
    return response;
  }
  logger.error("Unhandled API error", { error });
  const response = NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}
