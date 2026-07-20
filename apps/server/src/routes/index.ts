import { OpenAPIHono } from "@hono/zod-openapi";

import type { ServerDatabase } from "../db";
import { ChargingPointActorHost } from "../lib/chargingPointActorHost";
import {
  ActorLogWriter,
  type ActorLogSinkFactory,
} from "../lib/actorLogWriter";
import type { ChargingPointActorFactory } from "../modules/runtimeOperation/runtimeOperation.service";
import { createChargingPointRoute } from "../modules/chargingPoint/chargingPoint.route";
import { createConnectorRoute } from "../modules/connector/connector.route";
import { createRuntimeOperationRoute } from "../modules/runtimeOperation/runtimeOperation.route";
import { createActorLogRoute } from "../modules/actorLog/actorLog.route";
import { ChargingTransactionRepository } from "../modules/chargingTransaction/chargingTransaction.repo";
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
  chargingPointActorHost?: ChargingPointActorHost;
  createChargingPointActor?: ChargingPointActorFactory;
  actorLogWriter?: ActorLogSinkFactory;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new OpenAPIHono();
  const chargingTransactionRepository = dependencies.database === undefined
    ? undefined
    : new ChargingTransactionRepository(dependencies.database);
  const chargingPointActorHost =
    dependencies.chargingPointActorHost ??
    (dependencies.database === undefined
      ? new ChargingPointActorHost()
      : new ChargingPointActorHost({
          actorLogWriter:
            dependencies.actorLogWriter ?? new ActorLogWriter(dependencies.database),
          actorEventSink: chargingTransactionRepository === undefined
            ? undefined
            : {
                write: (event) => event.type === "transaction.meterValue" &&
                    event.resource.transactionId !== undefined
                  ? chargingTransactionRepository.recordSample(
                      event.chargingPointId,
                      {
                        ...event,
                        resource: {
                          transactionId: event.resource.transactionId,
                        },
                      },
                      { requireActiveTransaction: false },
                    )
                  : undefined,
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
  }

  return routes;
}
