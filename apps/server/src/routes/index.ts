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
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
  chargingPointActorHost?: ChargingPointActorHost;
  createChargingPointActor?: ChargingPointActorFactory;
  actorLogWriter?: ActorLogSinkFactory;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new OpenAPIHono();
  const chargingPointActorHost =
    dependencies.chargingPointActorHost ??
    (dependencies.database === undefined
      ? new ChargingPointActorHost()
      : new ChargingPointActorHost({
          actorLogWriter:
            dependencies.actorLogWriter ?? new ActorLogWriter(dependencies.database),
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
      }),
    );
    routes.route("/charging-points", createActorLogRoute(dependencies.database));
  }

  return routes;
}
