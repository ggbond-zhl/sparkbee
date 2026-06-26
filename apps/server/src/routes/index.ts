import { Hono } from "hono";

import type { ServerDatabase } from "../db";
import { createChargingPointRoute } from "../modules/chargingPoint/chargingPoint.route";
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new Hono();

  routes.route("/", createHealthRoute());
  if (dependencies.database !== undefined) {
    routes.route("/chargingPoints", createChargingPointRoute(dependencies.database));
  }

  return routes;
}
