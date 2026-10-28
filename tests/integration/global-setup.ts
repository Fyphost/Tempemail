import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/tempemail_test";

/** Recreate the schema once per run so every test run starts from the real migrations. */
export default async function setup(): Promise<void> {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  try {
    await pool.query("drop schema if exists public cascade");
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("create schema public");
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: path.resolve(__dirname, "../../drizzle"),
    });
  } finally {
    await pool.end();
  }
}
