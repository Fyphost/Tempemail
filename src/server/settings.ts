import { eq } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { systemSettings, type PlanId } from "@/server/db/schema";
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type PlanLimits,
  type SystemSettings,
} from "@/lib/settings-schema";

export { DEFAULT_SETTINGS, planLimitsSchema, settingsSchema } from "@/lib/settings-schema";
export type { PlanLimits, SystemSettings } from "@/lib/settings-schema";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively overlay stored values on defaults so new settings get sane values. */
export function mergeWithDefaults<T>(defaults: T, stored: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(stored)) {
    return (stored === undefined ? defaults : stored) as T;
  }
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(stored)) {
    if (!(key in defaults)) continue;
    result[key] = mergeWithDefaults((defaults as Record<string, unknown>)[key], value);
  }
  return result as T;
}

export function parseSettings(stored: unknown): SystemSettings {
  const merged = mergeWithDefaults(DEFAULT_SETTINGS, stored);
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

const CACHE_TTL_MS = 10_000;
const globals = globalThis as typeof globalThis & {
  __tempemailSettings?: { value: SystemSettings; loadedAt: number };
};

export async function getSettings(): Promise<SystemSettings> {
  const cached = globals.__tempemailSettings;
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value;
  const db = getDb();
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
  const value = parseSettings(row?.data);
  globals.__tempemailSettings = { value, loadedAt: Date.now() };
  return value;
}

export function invalidateSettingsCache(): void {
  globals.__tempemailSettings = undefined;
}

export async function saveSettings(
  next: SystemSettings,
  actorUserId: string | null,
): Promise<SystemSettings> {
  const value = settingsSchema.parse(next);
  if (value.plans.free.maxLifetimeMinutes < value.plans.free.inboxTtlMinutes) {
    throw new Error("Free plan maximum lifetime must be at least the default lifetime.");
  }
  if (value.plans.premium.maxLifetimeMinutes < value.plans.premium.inboxTtlMinutes) {
    throw new Error("Premium plan maximum lifetime must be at least the default lifetime.");
  }
  const db = getDb();
  await db
    .insert(systemSettings)
    .values({ id: 1, data: value, updatedBy: actorUserId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.id,
      set: { data: value, updatedBy: actorUserId, updatedAt: new Date() },
    });
  invalidateSettingsCache();
  return value;
}

/** Effective plan: premium only applies while premium features are enabled. */
export function effectivePlan(plan: PlanId | null | undefined, settings: SystemSettings): PlanId {
  return plan === "premium" && settings.premiumEnabled ? "premium" : "free";
}

export function limitsFor(plan: PlanId, settings: SystemSettings): PlanLimits {
  return settings.plans[effectivePlan(plan, settings)];
}
