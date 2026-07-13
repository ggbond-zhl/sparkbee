import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { loadServerConfig } from "./config/env";
import { createPostgresDatabase } from "./db/client";
import { ChargingPointRuntimeLogWriter } from "./lib/chargingPointRuntimeLogWriter";
import { RuntimeLogRetentionScheduler } from "./modules/runtimeLog/runtimeLogRetentionScheduler";

const config = loadServerConfig();
const database = createPostgresDatabase(config.databaseUrl);
const runtimeLogWriter = new ChargingPointRuntimeLogWriter(database);
const retentionScheduler = new RuntimeLogRetentionScheduler(database);
const app = createApp({
  database,
  corsAllowedOrigin: config.corsAllowedOrigin,
  runtimeLogWriter,
});

serve({
  fetch: app.fetch,
  port: config.port
});

console.info(`SparkBee server listening on http://localhost:${config.port}`);
retentionScheduler.start();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    retentionScheduler.stop();
    void runtimeLogWriter.flush().finally(() => process.exit(0));
  });
}
