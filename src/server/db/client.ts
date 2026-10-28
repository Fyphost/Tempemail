import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Transaction;

interface DbGlobals {
  pool?: pg.Pool;
  db?: Database;
}

// Survive hot reloads in development and share one pool per process.
const globals = globalThis as typeof globalThis & { __tempemailDb?: DbGlobals };
globals.__tempemailDb ??= {};
const state = globals.__tempemailDb;

export function sslOption(mode: string): pg.PoolConfig["ssl"] {
  if (mode === "require") return { rejectUnauthorized: true };
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return undefined;
}

export function getPool(): pg.Pool {
  if (!state.pool) {
    const env = getEnv();
    state.pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      ssl: sslOption(env.DATABASE_SSL),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "tempemail",
    });
    state.pool.on("error", (error) => {
      logger.error("PostgreSQL pool error", { error });
    });
  }
  return state.pool;
}

export function getDb(): Database {
  if (!state.db) {
    state.db = drizzle({ client: getPool(), schema });
  }
  return state.db;
}

export async function closeDb(): Promise<void> {
  const pool = state.pool;
  state.pool = undefined;
  state.db = undefined;
  if (pool) await pool.end();
}

export { schema };
