import { OpenAPIHono } from "@hono/zod-openapi";

import type { ServerDatabase } from "../db";
import { ChargingPointActorHost } from "../lib/chargingPointActorHost";
import {
  ActorLogWriter,
  type ActorLogSinkFactory,
} from "../lib/actorLogWriter";
import {
  ProtocolObservationWriter,
  type ProtocolObservationSink,
} from "../modules/protocolObservation/protocolObservation.writer";
import type { ChargingPointActorFactory } from "../modules/runtimeOperation/runtimeOperation.service";
import { createChargingPointRoute } from "../modules/chargingPoint/chargingPoint.route";
import { createConnectorRoute } from "../modules/connector/connector.route";
import { createRuntimeOperationRoute } from "../modules/runtimeOperation/runtimeOperation.route";
import { createActorLogRoute } from "../modules/actorLog/actorLog.route";
import { createProtocolObservationRoute } from "../modules/protocolObservation/protocolObservation.route";
import { createProtocolConfigurationRoute } from "../modules/protocolConfiguration/protocolConfiguration.route";
import { ChargingTransactionRepository } from "../modules/chargingTransaction/chargingTransaction.repo";
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
  chargingPointActorHost?: ChargingPointActorHost;
  createChargingPointActor?: ChargingPointActorFactory;
  actorLogWriter?: ActorLogSinkFactory;
  protocolObservationWriter?: ProtocolObservationSink;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new OpenAPIHono();
  const chargingTransactionRepository = dependencies.database === undefined
    ? undefined
    : new ChargingTransactionRepository(dependencies.database);
  const protocolObservationWriter = dependencies.database === undefined
    ? undefined
    : dependencies.protocolObservationWriter ??
      new ProtocolObservationWriter(dependencies.database);
  const chargingPointActorHost =
    dependencies.chargingPointActorHost ??
    (dependencies.database === undefined
      ? new ChargingPointActorHost()
      : new ChargingPointActorHost({
          actorLogWriter:
            dependencies.actorLogWriter ?? new ActorLogWriter(dependencies.database),
          actorEventSink: {
            write: async (event) => {
              if (
                event.type === "transaction.meterValue" &&
                event.resource.transactionId !== undefined
              ) {
                await chargingTransactionRepository?.recordSample(
                  event.chargingPointId,
                  {
                    ...event,
                    resource: {
                      transactionId: event.resource.transactionId,
                    },
                  },
                  { requireActiveTransaction: false },
                );
              }
              protocolObservationWriter?.write(event);
            },
            delete: (chargingPointId) =>
              protocolObservationWriter?.delete(chargingPointId),
          },
        }));

  routes.route("/", createHealthRoute(dependencies.database));
  if (dependencies.database !== undefined) {
    routes.route(
      "/charging-points",
      createChargingPointRoute(dependencies.database, {
        chargingPointActorHost,
      }),
    );
    routes.route("/charging-points", createConnectorRoute(dependencies.database));
    routes.route(
      "/charging-points",
      createRuntimeOperationRoute(dependencies.database, {
        chargingPointActorHost,
        createChargingPointActor: dependencies.createChargingPointActor,
        chargingTransactionRepository,
      }),
    );
    routes.route("/charging-points", createActorLogRoute(dependencies.database));
    routes.route(
      "/charging-points",
      createProtocolObservationRoute(dependencies.database),
    );
    routes.route(
      "/charging-points",
      createProtocolConfigurationRoute(dependencies.database, {
        chargingPointActorHost,
      }),
    );
  }

  return routes;
}
