import { OpenAPIHono } from "@hono/zod-openapi";

import type { ServerDatabase } from "../db";
import type { ChargingPointActorRegistry } from "../lib/chargingPointActorRegistry";
import type { ChargingPointActorFactory } from "../modules/chargingPointOperation/chargingPointOperation.service";
import { createChargingPointRoute } from "../modules/chargingPoint/chargingPoint.route";
import { createChargingPointOperationRoute } from "../modules/chargingPointOperation/chargingPointOperation.route";
import { createConnectorRoute } from "../modules/connector/connector.route";
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
  chargingPointActorRegistry?: ChargingPointActorRegistry;
  createChargingPointActor?: ChargingPointActorFactory;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new OpenAPIHono();

  routes.route("/", createHealthRoute());
  if (dependencies.database !== undefined) {
    routes.route("/charging-points", createChargingPointRoute(dependencies.database));
    routes.route("/charging-points", createConnectorRoute(dependencies.database));
    routes.route(
      "/charging-points",
      createChargingPointOperationRoute(dependencies.database, {
        chargingPointActorRegistry: dependencies.chargingPointActorRegistry,
        createChargingPointActor: dependencies.createChargingPointActor,
      }),
    );
  }

  return routes;
}
