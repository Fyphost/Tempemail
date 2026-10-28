import type { NextRequest } from "next/server";

import { clientIpFromHeaders, hashIp, rateLimitSubject } from "@/server/security/ip";
import { consumeMemoryRateLimit } from "@/server/security/rate-limit";
import { getSettings, type SystemSettings } from "@/server/settings";
import { countApiRequest } from "@/server/stats";

import { errors } from "./errors";
import { errorResponse } from "./respond";

export interface RequestMeta {
  ip: string;
  ipHash: string;
  settings: SystemSettings;
}

export interface RouteOptions {
  /** Skip the general per-IP request budget (webhooks authenticate with signatures instead). */
  skipRateLimit?: boolean;
  /** Do not count the request in the API volume metric. */
  skipMetrics?: boolean;
}

/**
 * Wraps a route handler with the shared per-IP request budget, metrics and
 * the consistent JSON error envelope.
 */
export function apiRoute<Ctx>(
  handler: (request: NextRequest, context: Ctx, meta: RequestMeta) => Promise<Response>,
  options: RouteOptions = {},
): (request: NextRequest, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    try {
      const ip = clientIpFromHeaders(request.headers);
      const settings = await getSettings();
      if (!options.skipRateLimit) {
        const budget = consumeMemoryRateLimit(
          `api:${rateLimitSubject(ip)}`,
          settings.rateLimits.apiRequestsPerMinute,
          60,
        );
        if (!budget.allowed) throw errors.rateLimited(budget.retryAfterSeconds);
      }
      if (!options.skipMetrics) countApiRequest();
      return await handler(request, context, { ip, ipHash: hashIp(ip), settings });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export type IdParams = { params: Promise<{ id: string }> };
