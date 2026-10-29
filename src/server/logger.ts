/**
 * Minimal structured logger. Emits one JSON object per line in production and
 * a readable line in development. Callers must never pass secrets, tokens,
 * message bodies, or raw IP addresses as fields.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
  return LEVELS[configured] ?? LEVELS.info;
}

function serializeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold()) return;
  if (process.env.NODE_ENV === "test" && level !== "error" && !process.env.LOG_IN_TESTS) return;

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    normalized[key] = serializeError(value);
  }

  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  if (process.env.NODE_ENV === "production") {
    stream.write(
      `${JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...normalized })}\n`,
    );
    return;
  }
  const extra = Object.keys(normalized).length > 0 ? ` ${JSON.stringify(normalized)}` : "";
  stream.write(`[${level}] ${message}${extra}\n`);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
