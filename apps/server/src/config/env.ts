import "dotenv/config";

import { z } from "zod";

export interface ServerConfig {
  adminPassword: string;
  databaseUrl: string;
  eventLogRetentionPerStation: number;
  port: number;
  sessionSecret: string;
}

const envSchema = z.object({
  ADMIN_PASSWORD: z.string().min(8),
  DATABASE_URL: z.string().min(1).url(),
  EVENT_LOG_RETENTION_PER_STATION: z.coerce.number().int().positive().default(10_000),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SESSION_SECRET: z.string().min(32)
});

export function loadServerConfig(rawEnv: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server config: ${details}`);
  }

  return {
    adminPassword: result.data.ADMIN_PASSWORD,
    databaseUrl: result.data.DATABASE_URL,
    eventLogRetentionPerStation: result.data.EVENT_LOG_RETENTION_PER_STATION,
    port: result.data.PORT,
    sessionSecret: result.data.SESSION_SECRET
  };
}
