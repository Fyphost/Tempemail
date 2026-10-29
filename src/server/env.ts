import { z } from "zod";

/**
 * Environment configuration, validated once on first use.
 *
 * Parsing is lazy so that `next build` can compile route modules without a
 * database or secrets present. Every server entry point that needs config
 * calls `getEnv()` at request/start time instead.
 */

const booleanish = z
  .enum(["true", "false", "1", "0", "yes", "no", ""])
  .transform((value) => value === "true" || value === "1" || value === "yes");

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined));

const commaList = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );

const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-change-me-0000";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
  DATABASE_SSL: z.enum(["disable", "require", "no-verify"]).default("disable"),
  APP_URL: z.url().default("http://localhost:3000"),
  SESSION_SECRET: optionalString,
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  INBOUND_WEBHOOK_SECRET: optionalString,
  MAILGUN_WEBHOOK_SIGNING_KEY: optionalString,
  WEBHOOK_MAX_SKEW_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  SMTP_ENABLED: booleanish.default(true),
  SMTP_BIND_HOST: z.string().default("0.0.0.0"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(2525),
  SMTP_HOSTNAME: optionalString,
  SMTP_TLS_KEY_FILE: optionalString,
  SMTP_TLS_CERT_FILE: optionalString,
  SMTP_MAX_CLIENTS: z.coerce.number().int().min(1).max(10000).default(200),
  SMTP_USE_PROXY_PROTOCOL: booleanish.default(false),
  MX_TARGETS: commaList,
  SKIP_MX_CHECK: booleanish.default(false),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  ADMIN_BOOTSTRAP_EMAIL: optionalString,
  ADMIN_BOOTSTRAP_PASSWORD: optionalString,
  CONTACT_EMAIL: optionalString,
  ABUSE_EMAIL: optionalString,
  OPERATOR_NAME: optionalString,
  LOG_LEVEL: z
    .string()
    .optional()
    .transform((value) => {
      const level = (value ?? "").toLowerCase();
      return (
        (["debug", "info", "warn", "error"] as const).find((known) => known === level) ?? "info"
      );
    }),
});

export type Env = z.infer<typeof envSchema> & {
  SESSION_SECRET: string;
  isProduction: boolean;
  cookieSecure: boolean;
  appOrigin: string;
};

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === "production";

  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProduction) {
      throw new Error("SESSION_SECRET must be set in production (at least 32 characters).");
    }
    sessionSecret = DEV_SESSION_SECRET;
    console.warn("[tempemail] SESSION_SECRET is not set; using an insecure development secret.");
  }
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long.");
  }
  if (isProduction && sessionSecret === DEV_SESSION_SECRET) {
    throw new Error("SESSION_SECRET must not use the development placeholder in production.");
  }

  const appUrl = new URL(env.APP_URL);
  cached = {
    ...env,
    SESSION_SECRET: sessionSecret,
    isProduction,
    cookieSecure: appUrl.protocol === "https:",
    appOrigin: appUrl.origin,
  };
  return cached;
}

/** Test helper: forget the cached configuration so a test can change process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
