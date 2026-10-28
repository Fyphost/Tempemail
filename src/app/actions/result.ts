import { z } from "zod";

import { ApiError } from "@/server/http/errors";
import { logger } from "@/server/logger";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Run a server action body and convert failures into a serialisable result. */
export async function runAction<T>(task: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await task() };
  } catch (error) {
    // redirect()/notFound() throw control-flow errors that must propagate.
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (error instanceof ApiError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return { ok: false, error: issue ? issue.message : "Invalid input." };
    }
    logger.error("Server action failed", { error });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
