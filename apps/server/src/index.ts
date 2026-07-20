import { serve } from "@hono/node-server";

import { createApp, startServer } from "./app";
import { loadServerConfig } from "./config/env";
import { createSentryErrorReporter } from "./config/errorReporter";
import { createServerLogger } from "./config/logger";
import { createPostgresDatabase } from "./db/client";
import { ActorLogWriter } from "./lib/actorLogWriter";
import { ChargingPointActorHost } from "./lib/chargingPointActorHost";
import { ActorLogRetentionScheduler } from "./modules/actorLog/actorLogRetentionScheduler";
import { ChargingTransactionRepository } from "./modules/chargingTransaction/chargingTransaction.repo";
import { ChargingTransactionRetentionScheduler } from "./modules/chargingTransaction/chargingTransactionRetentionScheduler";
import { createRuntimeOperationService } from "./modules/runtimeOperation/runtimeOperation.service";

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
const chargingTransactionRepository = new ChargingTransactionRepository(database);
const chargingPointActorHost = new ChargingPointActorHost({
  actorLogWriter,
  actorEventSink: {
    write: (event) => event.type === "transaction.meterValue" &&
        event.resource.transactionId !== undefined
      ? chargingTransactionRepository.recordSample(event.chargingPointId, {
          ...event,
          resource: { transactionId: event.resource.transactionId },
        }, { requireActiveTransaction: false })
      : undefined,
  },
});
const runtimeOperationService = createRuntimeOperationService(database, {
  chargingPointActorHost,
  chargingTransactionRepository,
});
const retentionScheduler = new ActorLogRetentionScheduler(database, {
  logger,
  errorReporter,
});
const chargingTransactionRetentionScheduler =
  new ChargingTransactionRetentionScheduler(database, {
    logger,
    errorReporter,
  });
const app = createApp({
  database,
  environment: config.environment,
  corsAllowedOrigin: config.corsAllowedOrigin,
  actorLogWriter,
  chargingPointActorHost,
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
    chargingTransactionRetentionScheduler.start();
    void runtimeOperationService.recoverActiveTransactions().then((result) => {
      logger.info({
        event: "runtime-recovery.completed",
        recoveredChargingPointIds: result.recovered,
        failedChargingPointIds: result.failed.map((item) => item.chargingPointId),
      }, "Active charging point transactions recovery completed");
      for (const failure of result.failed) {
        logger.error({
          event: "runtime-recovery.failed",
          chargingPointId: failure.chargingPointId,
          error: failure.error,
        }, "Active charging point transaction recovery failed");
      }
    });
  },
}).catch(() => process.exit(1));

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ event: "server.stopping", signal }, "SparkBee server stopping");
    retentionScheduler.stop();
    chargingTransactionRetentionScheduler.stop();
    void actorLogWriter.flush().finally(() => {
      logger.info({ event: "server.stopped", signal }, "SparkBee server stopped");
      process.exit(0);
    });
  });
}
