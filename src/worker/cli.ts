import { parseArgs } from "node:util";

import { SYSTEM_ACTOR } from "@/server/audit";
import { createUser, normalizeEmail } from "@/server/auth/users";
import { closeDb, getDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { users } from "@/server/db/schema";
import { runCleanup } from "@/server/jobs/cleanup";
import { eq } from "drizzle-orm";

const USAGE = `Usage:
  cli migrate                                   Apply database migrations
  cli create-admin --email <email> --password <password>
                                                Create (or promote) an administrator
  cli cleanup                                   Run the retention cleanup once`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "migrate": {
      await runMigrations();
      console.log("Migrations applied.");
      break;
    }
    case "create-admin": {
      const { values } = parseArgs({
        args: rest,
        options: { email: { type: "string" }, password: { type: "string" } },
      });
      if (!values.email || !values.password) throw new Error(USAGE);
      const email = normalizeEmail(values.email);
      const db = getDb();
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing) {
        await db
          .update(users)
          .set({ role: "admin", status: "active" })
          .where(eq(users.id, existing.id));
        console.log(`Promoted ${email} to administrator.`);
      } else {
        await createUser({ email, password: values.password, role: "admin" }, SYSTEM_ACTOR);
        console.log(`Created administrator ${email}.`);
      }
      break;
    }
    case "cleanup": {
      console.log(JSON.stringify(await runCleanup(), null, 2));
      break;
    }
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
