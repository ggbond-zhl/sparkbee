import { Hono } from "hono";

import { ChargingPointController } from "../controllers/charging-point.controller";
import type { AppBindings } from "../types/app";

export function createChargingPointRoute() {
  const route = new Hono<AppBindings>();
  const controller = new ChargingPointController();

  route.get("/", (context) => controller.list(context));
  route.post("/", (context) => controller.create(context));
  route.get("/:id", (context) => controller.get(context));
  route.patch("/:id", (context) => controller.update(context));
  route.delete("/:id", (context) => controller.delete(context));
  route.post("/:id/start", (context) => controller.start(context));
  route.post("/:id/stop", (context) => controller.stop(context));
  route.post("/:id/connectors/:connectorId/plug", (context) => controller.plug(context));
  route.post("/:id/connectors/:connectorId/unplug", (context) => controller.unplug(context));
  route.post("/:id/authorize", (context) => controller.authorize(context));
  route.post("/:id/transactions/start", (context) => controller.startTransaction(context));
  route.post("/:id/transactions/:transactionId/meter-values", (context) => controller.reportMeterValue(context));
  route.post("/:id/transactions/:transactionId/stop", (context) => controller.stopTransaction(context));
  route.get("/:id/events", (context) => controller.listEvents(context));

  return route;
}
