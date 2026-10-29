import { getDb, type DbOrTx } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { logger } from "@/server/logger";

export interface AuditActor {
  userId: string | null;
  label: string;
  ipHash?: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { userId: null, label: "system" };

export async function writeAudit(
  actor: AuditActor,
  action: string,
  target: { type?: string; id?: string } = {},
  metadata?: Record<string, unknown>,
  db: DbOrTx = getDb(),
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: actor.userId,
      actorLabel: actor.label,
      action,
      targetType: target.type ?? null,
      targetId: target.id ?? null,
      metadata: metadata ?? null,
      ipHash: actor.ipHash ?? null,
    });
  } catch (error) {
    // Auditing must never break the primary action.
    logger.error("Failed to write audit log", { action, error });
  }
}
