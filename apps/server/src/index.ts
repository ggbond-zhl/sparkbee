import { serve } from "@hono/node-server";

import { createApp, startServer } from "./app";
import { loadServerConfig } from "./config/env";
import { createSentryErrorReporter } from "./config/errorReporter";
import { createServerLogger } from "./config/logger";
import { createPostgresDatabase } from "./db/client";
import { ActorLogWriter } from "./lib/actorLogWriter";
import { ChargingPointActorHost } from "./lib/chargingPointActorHost";
import { ProtocolObservationWriter } from "./modules/protocolObservation/protocolObservation.writer";
import { ProtocolConfigurationRepository } from "./modules/protocolConfiguration/protocolConfiguration.repo";
import { ActorLogRetentionScheduler } from "./modules/actorLog/actorLogRetentionScheduler";
import { ChargingTransactionRepository } from "./modules/chargingTransaction/chargingTransaction.repo";
import { ProtocolObservationRetentionScheduler } from "./modules/protocolObservation/protocolObservationRetentionScheduler";
import { createRuntimeOperationService } from "./modules/runtimeOperation/runtimeOperation.service";
import { TransactionDeliveryRetentionScheduler } from "./modules/transactionDelivery/transactionDeliveryRetentionScheduler";

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
const protocolObservationWriter = new ProtocolObservationWriter(database, {
  logger,
  errorReporter,
});
const protocolConfigurationRepository = new ProtocolConfigurationRepository(database);
const chargingPointActorHost = new ChargingPointActorHost({
  actorLogWriter,
  actorEventSink: {
    write: async (event) => {
      if (
        event.type === "transaction.meterValue" &&
        event.resource.transactionId !== undefined
      ) {
        await chargingTransactionRepository.recordSample(event.chargingPointId, {
          ...event,
          resource: { transactionId: event.resource.transactionId },
        }, { requireActiveTransaction: false });
      }
      protocolObservationWriter.write(event);
    },
    delete: (chargingPointId) => protocolObservationWriter.delete(chargingPointId),
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
const transactionDeliveryRetentionScheduler =
  new TransactionDeliveryRetentionScheduler(database, {
    logger,
    errorReporter,
  });
const protocolObservationRetentionScheduler =
  new ProtocolObservationRetentionScheduler(database, {
    logger,
    errorReporter,
  });
const app = createApp({
  database,
  environment: config.environment,
  corsAllowedOrigin: config.corsAllowedOrigin,
  actorLogWriter,
  protocolObservationWriter,
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
    transactionDeliveryRetentionScheduler.start();
    protocolObservationRetentionScheduler.start();
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
  prepare: () => protocolConfigurationRepository.initializeMissingDirectories(),
}).catch(() => process.exit(1));

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ event: "server.stopping", signal }, "SparkBee server stopping");
    retentionScheduler.stop();
    transactionDeliveryRetentionScheduler.stop();
    protocolObservationRetentionScheduler.stop();
    void Promise.all([
      actorLogWriter.flush(),
      protocolObservationWriter.flush(),
    ]).finally(() => {
      logger.info({ event: "server.stopped", signal }, "SparkBee server stopped");
      process.exit(0);
    });
  });
}
