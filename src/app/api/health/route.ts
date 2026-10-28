import { sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { errorResponse, ok } from "@/server/http/respond";
import { errors } from "@/server/http/errors";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for load balancers and container orchestrators. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
  } catch {
    return errorResponse(errors.unavailable("Database unavailable."));
  }
  return ok({ status: "ok", time: new Date().toISOString() });
}
