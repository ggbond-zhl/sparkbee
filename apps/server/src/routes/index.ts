import { OpenAPIHono } from "@hono/zod-openapi";

import type { ServerDatabase } from "../db";
import { ChargingPointActorRegistry } from "../lib/chargingPointActorRegistry";
import { ChargingPointEventStreamHub } from "../lib/chargingPointEventStreamHub";
import type { ChargingPointActorFactory } from "../modules/chargingPointOperation/chargingPointOperation.service";
import { createChargingPointRoute } from "../modules/chargingPoint/chargingPoint.route";
import { createChargingPointOperationRoute } from "../modules/chargingPointOperation/chargingPointOperation.route";
import { createConnectorRoute } from "../modules/connector/connector.route";
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
  chargingPointActorRegistry?: ChargingPointActorRegistry;
  chargingPointEventStreamHub?: ChargingPointEventStreamHub;
  createChargingPointActor?: ChargingPointActorFactory;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new OpenAPIHono();
  const chargingPointActorRegistry =
    dependencies.chargingPointActorRegistry ?? new ChargingPointActorRegistry();
  const chargingPointEventStreamHub =
    dependencies.chargingPointEventStreamHub ?? new ChargingPointEventStreamHub();

  routes.route("/", createHealthRoute());
  if (dependencies.database !== undefined) {
    routes.route(
      "/charging-points",
      createChargingPointRoute(dependencies.database, {
        chargingPointEventStreamHub,
      }),
    );
    routes.route("/charging-points", createConnectorRoute(dependencies.database));
    routes.route(
      "/charging-points",
      createChargingPointOperationRoute(dependencies.database, {
        chargingPointActorRegistry,
        chargingPointEventStreamHub,
        createChargingPointActor: dependencies.createChargingPointActor,
      }),
    );
  }

  return routes;
}
