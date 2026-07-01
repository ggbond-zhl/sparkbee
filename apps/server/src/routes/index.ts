import { OpenAPIHono } from "@hono/zod-openapi";

import type { ServerDatabase } from "../db";
import { ChargingPointActorRegistry } from "../lib/chargingPointActorRegistry";
import { ChargingPointDiagnosticFileWriter } from "../lib/chargingPointDiagnosticFileWriter";
import { ChargingPointEventStreamHub } from "../lib/chargingPointEventStreamHub";
import type { ChargingPointActorFactory } from "../modules/runtimeOperation/runtimeOperation.service";
import { createChargingPointRoute } from "../modules/chargingPoint/chargingPoint.route";
import { createConnectorRoute } from "../modules/connector/connector.route";
import { createRuntimeOperationRoute } from "../modules/runtimeOperation/runtimeOperation.route";
import { createHealthRoute } from "./health.route";

export interface RouteDependencies {
  database?: ServerDatabase;
  chargingPointActorRegistry?: ChargingPointActorRegistry;
  chargingPointDiagnosticFileWriter?: ChargingPointDiagnosticFileWriter;
  chargingPointEventStreamHub?: ChargingPointEventStreamHub;
  createChargingPointActor?: ChargingPointActorFactory;
}

export function createRoutes(dependencies: RouteDependencies = {}) {
  const routes = new OpenAPIHono();
  const chargingPointActorRegistry =
    dependencies.chargingPointActorRegistry ?? new ChargingPointActorRegistry();
  const chargingPointEventStreamHub =
    dependencies.chargingPointEventStreamHub ?? new ChargingPointEventStreamHub();
  const chargingPointDiagnosticFileWriter =
    dependencies.chargingPointDiagnosticFileWriter ??
    new ChargingPointDiagnosticFileWriter("logs/diagnostics");

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
      createRuntimeOperationRoute(dependencies.database, {
        chargingPointActorRegistry,
        chargingPointDiagnosticFileWriter,
        chargingPointEventStreamHub,
        createChargingPointActor: dependencies.createChargingPointActor,
      }),
    );
  }

  return routes;
}
