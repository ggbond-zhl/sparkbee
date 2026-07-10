import { OpenAPIHono } from "@hono/zod-openapi";

import type { ServerDatabase } from "../db";
import { ChargingPointActorHost } from "../lib/chargingPointActorHost";
import { ChargingPointRuntimeLogFileWriter } from "../lib/chargingPointRuntimeLogFileWriter";
import type { ChargingPointActorFactory } from "../modules/runtimeOperation/runtimeOperation.service";
import { createChargingPointRoute } from "../modules/chargingPoint/chargingPoint.route";
import { createConnectorRoute } from "../modules/connector/connector.route";
import { createRuntimeOperationRoute } from "../modules/runtimeOperation/runtimeOperation.route";
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
  chargingPointActorHost?: ChargingPointActorHost;
  runtimeLogDirectory?: string;
  createChargingPointActor?: ChargingPointActorFactory;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new OpenAPIHono();
  const chargingPointActorHost =
    dependencies.chargingPointActorHost ??
    new ChargingPointActorHost({
      runtimeLogFileWriter: new ChargingPointRuntimeLogFileWriter(
        dependencies.runtimeLogDirectory ?? "logs/runtime",
      ),
    });

  routes.route("/", createHealthRoute());
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
  }

  return routes;
}
