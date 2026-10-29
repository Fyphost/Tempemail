import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { getDb } from "./client";

export function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle");
}

export async function runMigrations(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: migrationsFolder() });
}
