import {
  createChargingPointRequestSchema,
  createConnectorRequestSchema,
  listChargingPointsQuerySchema,
  updateChargingPointRequestSchema,
  updateConnectorRequestSchema,
} from "@spark-bee/contracts";
import { Hono } from "hono";

import type { ServerDatabase } from "../../db";
import { parseRequest } from "../../utils/validation";
import { ChargingPointRepository } from "./chargingPoint.repo";

export function createChargingPointRoute(database: ServerDatabase) {
  const route = new Hono();
  const repository = new ChargingPointRepository(database);

  route.post("/", async (context) => {
    const input = parseRequest(createChargingPointRequestSchema, await context.req.json());
    const chargingPoint = await repository.create(input);
    return context.json(chargingPoint, 201);
  });

  route.get("/", async (context) => {
    const query = parseRequest(listChargingPointsQuerySchema, context.req.query());
    return context.json(await repository.list(query));
  });

  route.get("/:id", async (context) => {
    return context.json(await repository.getById(context.req.param("id")));
  });

  route.patch("/:id", async (context) => {
    const input = parseRequest(updateChargingPointRequestSchema, await context.req.json());
    return context.json(await repository.update(context.req.param("id"), input));
  });

  route.delete("/:id", async (context) => {
    await repository.softDelete(context.req.param("id"));
    return context.body(null, 204);
  });

  route.post("/:chargingPointId/connectors", async (context) => {
    const input = parseRequest(createConnectorRequestSchema, await context.req.json());
    const connector = await repository.createConnector(
      context.req.param("chargingPointId"),
      input,
    );
    return context.json(connector, 201);
  });

  route.get("/:chargingPointId/connectors", async (context) => {
    return context.json(await repository.listConnectors(context.req.param("chargingPointId")));
  });

  route.get("/:chargingPointId/connectors/:id", async (context) => {
    return context.json(
      await repository.getConnector(
        context.req.param("chargingPointId"),
        context.req.param("id"),
      ),
    );
  });

  route.patch("/:chargingPointId/connectors/:id", async (context) => {
    const input = parseRequest(updateConnectorRequestSchema, await context.req.json());
    return context.json(
      await repository.updateConnector(
        context.req.param("chargingPointId"),
        context.req.param("id"),
        input,
      ),
    );
  });

  route.delete("/:chargingPointId/connectors/:id", async (context) => {
    await repository.softDeleteConnector(
      context.req.param("chargingPointId"),
      context.req.param("id"),
    );
    return context.body(null, 204);
  });

  return route;
}
