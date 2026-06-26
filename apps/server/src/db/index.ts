import { drizzle } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase> | PgliteDatabase<typeof schema>;

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  return drizzle(client, { schema });
}
