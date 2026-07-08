import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { loadServerConfig } from "./config/env";
import { createPostgresDatabase } from "./db/client";

const config = loadServerConfig();
const database = createPostgresDatabase(config.databaseUrl);
const app = createApp({
  database,
  runtimeLogDirectory: config.runtimeLogDirectory,
});

serve({
  fetch: app.fetch,
  port: config.port
});

console.info(`SparkBee server listening on http://localhost:${config.port}`);
