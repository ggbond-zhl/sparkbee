import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import type { Level } from "pino";
import { z } from "zod";

export const serverEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));

loadDotenv({ path: serverEnvPath, quiet: true });

export interface ServerConfig {
  port: number;
  databaseUrl: string;
  corsAllowedOrigin: string;
  environment: "development" | "test" | "production";
  logLevel: Level;
  sentryDsn?: string;
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url().default("postgres://postgres:postgres@localhost:5432/sparkbee"),
  CORS_ALLOWED_ORIGIN: z.string().url().default("http://localhost:3001"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),
  SENTRY_DSN: z.string().url().optional(),
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
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    corsAllowedOrigin: result.data.CORS_ALLOWED_ORIGIN,
    environment: result.data.NODE_ENV,
    logLevel: result.data.LOG_LEVEL ??
      (result.data.NODE_ENV === "development" ? "debug" : "info"),
    sentryDsn: result.data.SENTRY_DSN,
  };
}
