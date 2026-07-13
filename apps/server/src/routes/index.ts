import { OpenAPIHono } from "@hono/zod-openapi";

import type { ServerDatabase } from "../db";
import { ChargingPointActorHost } from "../lib/chargingPointActorHost";
import {
  ChargingPointRuntimeLogWriter,
  type ChargingPointRuntimeLogSinkFactory,
} from "../lib/chargingPointRuntimeLogWriter";
import type { ChargingPointActorFactory } from "../modules/runtimeOperation/runtimeOperation.service";
import { createChargingPointRoute } from "../modules/chargingPoint/chargingPoint.route";
import { createConnectorRoute } from "../modules/connector/connector.route";
import { createRuntimeOperationRoute } from "../modules/runtimeOperation/runtimeOperation.route";
import { createRuntimeLogRoute } from "../modules/runtimeLog/runtimeLog.route";
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
  chargingPointActorHost?: ChargingPointActorHost;
  createChargingPointActor?: ChargingPointActorFactory;
  runtimeLogWriter?: ChargingPointRuntimeLogSinkFactory;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new OpenAPIHono();
  const chargingPointActorHost =
    dependencies.chargingPointActorHost ??
    (dependencies.database === undefined
      ? new ChargingPointActorHost()
      : new ChargingPointActorHost({
          runtimeLogWriter:
            dependencies.runtimeLogWriter ?? new ChargingPointRuntimeLogWriter(dependencies.database),
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
    routes.route("/charging-points", createRuntimeLogRoute(dependencies.database));
  }

  return routes;
}
