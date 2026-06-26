import { OpenAPIHono } from "@hono/zod-openapi";

import type { ServerDatabase } from "../db";
import { createChargingPointRoute } from "../modules/chargingPoint/chargingPoint.route";
import { createConnectorRoute } from "../modules/connector/connector.route";
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new OpenAPIHono();

  routes.route("/", createHealthRoute());
  if (dependencies.database !== undefined) {
    routes.route("/charging-points", createChargingPointRoute(dependencies.database));
    routes.route("/charging-points", createConnectorRoute(dependencies.database));
  }

  return routes;
}
