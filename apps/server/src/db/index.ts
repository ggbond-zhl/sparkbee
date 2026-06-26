import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";

import * as schema from "./schema";

export type ServerDatabase = PgliteDatabase<typeof schema> | NodePgDatabase<typeof schema>;
export { schema };
