import { serve } from "@hono/node-server";

import { createApp, startServer } from "./app";
import { loadServerConfig } from "./config/env";
import { createSentryErrorReporter } from "./config/errorReporter";
import { createServerLogger } from "./config/logger";
import { createPostgresDatabase } from "./db/client";
import { ActorLogWriter } from "./lib/actorLogWriter";
import { ActorLogRetentionScheduler } from "./modules/actorLog/actorLogRetentionScheduler";

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
const actorLogWriter = new ActorLogWriter(database, {
  logger,
  errorReporter,
});
const retentionScheduler = new ActorLogRetentionScheduler(database, {
  logger,
  errorReporter,
});
const app = createApp({
  database,
  environment: config.environment,
  corsAllowedOrigin: config.corsAllowedOrigin,
  actorLogWriter,
  logger,
  errorReporter,
});

await startServer({
  database,
  errorReporter,
  listen() {
    serve({
      fetch: app.fetch,
      port: config.port,
    });
  },
  logger,
  onStarted() {
    logger.info({
      event: "server.started",
      port: config.port,
      environment: config.environment,
    }, "SparkBee server started");
    retentionScheduler.start();
  },
}).catch(() => process.exit(1));

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ event: "server.stopping", signal }, "SparkBee server stopping");
    retentionScheduler.stop();
    void actorLogWriter.flush().finally(() => {
      logger.info({ event: "server.stopped", signal }, "SparkBee server stopped");
      process.exit(0);
    });
  });
}
