import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { migrateDatabase } from "../../src/db/migrate";
import { schema, type ServerDatabase } from "../../src/db";

export async function createTestDatabase(): Promise<ServerDatabase> {
  const client = new PGlite();
  await migrateDatabase(client);
  return drizzle({ client, schema });
}
