import type { z } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { details?: unknown; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.headers = options.headers;
  }
}

export function validationError(error: z.ZodError): ApiError {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return new ApiError(422, "validation_failed", "The request did not pass validation.", {
    details: { issues },
  });
}

export const errors = {
  badRequest: (message: string, details?: unknown) =>
    new ApiError(400, "bad_request", message, { details }),
  unauthorized: (message = "A valid inbox session or token is required.") =>
    new ApiError(401, "unauthorized", message),
  forbidden: (message = "You do not have permission to perform this action.") =>
    new ApiError(403, "forbidden", message),
  notFound: (message = "The requested resource was not found.") =>
    new ApiError(404, "not_found", message),
  conflict: (message: string, code = "conflict") => new ApiError(409, code, message),
  gone: (message: string) => new ApiError(410, "gone", message),
  payloadTooLarge: (message = "The request body is too large.") =>
    new ApiError(413, "payload_too_large", message),
  unsupportedMediaType: (message = "Unsupported content type.") =>
    new ApiError(415, "unsupported_media_type", message),
  rateLimited: (retryAfterSeconds: number, message = "Too many requests. Please slow down.") =>
    new ApiError(429, "rate_limited", message, {
      details: { retryAfterSeconds },
      headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
    }),
  unavailable: (message: string) => new ApiError(503, "service_unavailable", message),
};
