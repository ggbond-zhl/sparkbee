import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { loadServerConfig } from "./config/env";
import { createSentryErrorReporter } from "./config/errorReporter";
import { createServerLogger } from "./config/logger";
import { createPostgresDatabase } from "./db/client";
import { ChargingPointRuntimeLogWriter } from "./lib/chargingPointRuntimeLogWriter";
import { RuntimeLogRetentionScheduler } from "./modules/runtimeLog/runtimeLogRetentionScheduler";

const config = loadServerConfig();
const logger = createServerLogger({
  environment: config.environment,
  level: config.logLevel,
});
const errorReporter = createSentryErrorReporter({
  dsn: config.sentryDsn,
  environment: config.environment,
  logger,
});
const database = createPostgresDatabase(config.databaseUrl);
const runtimeLogWriter = new ChargingPointRuntimeLogWriter(database, {
  logger,
  errorReporter,
});
const retentionScheduler = new RuntimeLogRetentionScheduler(database, {
  logger,
  errorReporter,
});
const app = createApp({
  database,
  environment: config.environment,
  corsAllowedOrigin: config.corsAllowedOrigin,
  runtimeLogWriter,
  logger,
  errorReporter,
});

serve({
  fetch: app.fetch,
  port: config.port
});

logger.info({
  event: "server.started",
  port: config.port,
  environment: config.environment,
}, "SparkBee 服务已启动");
retentionScheduler.start();

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ event: "server.stopping", signal }, "SparkBee 服务正在停止");
    retentionScheduler.stop();
    void runtimeLogWriter.flush().finally(() => {
      logger.info({ event: "server.stopped", signal }, "SparkBee 服务已停止");
      process.exit(0);
    });
  });
}
