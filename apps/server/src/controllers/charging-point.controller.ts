import type { Context } from "hono";

import type { AppBindings } from "../types/app";
import { created, noContent, ok } from "../utils/response";
import { ChargingPointRequestInput } from "./charging-point-request-input";

export class ChargingPointController {
  async list(context: Context<AppBindings>) {
    return ok(context, await context.get("services").chargingPoints.listChargingPoints());
  }

  async create(context: Context<AppBindings>) {
    const input = await new ChargingPointRequestInput(context).createChargingPoint();
    return created(context, await context.get("services").chargingPoints.createChargingPoint(input));
  }

  async get(context: Context<AppBindings>) {
    const id = new ChargingPointRequestInput(context).chargingPointId();
    return ok(context, await context.get("services").chargingPoints.getChargingPoint(id));
  }

  async update(context: Context<AppBindings>) {
    const { id, input } = await new ChargingPointRequestInput(context).updateChargingPoint();
    return ok(context, await context.get("services").chargingPoints.updateChargingPoint(id, input));
  }

  async delete(context: Context<AppBindings>) {
    const id = new ChargingPointRequestInput(context).chargingPointId();
    await context.get("services").chargingPoints.deleteChargingPoint(id);
    return noContent(context);
  }

  async start(context: Context<AppBindings>) {
    const id = new ChargingPointRequestInput(context).chargingPointId();
    return ok(context, await context.get("services").chargingPoints.startChargingPoint(id));
  }

  async stop(context: Context<AppBindings>) {
    const id = new ChargingPointRequestInput(context).chargingPointId();
    await context.get("services").chargingPoints.stopChargingPoint(id);
    return noContent(context);
  }

  async plug(context: Context<AppBindings>) {
    const { id, connectorId } = new ChargingPointRequestInput(context).connectorAction();
    return ok(context, await context.get("services").chargingPoints.plug(id, connectorId));
  }

  async unplug(context: Context<AppBindings>) {
    const { id, connectorId } = new ChargingPointRequestInput(context).connectorAction();
    return ok(context, await context.get("services").chargingPoints.unplug(id, connectorId));
  }

  async authorize(context: Context<AppBindings>) {
    const { id, input } = await new ChargingPointRequestInput(context).authorize();
    return ok(context, await context.get("services").chargingPoints.authorize(id, input));
  }

  async startTransaction(context: Context<AppBindings>) {
    const { id, input } = await new ChargingPointRequestInput(context).startTransaction();
    return ok(context, await context.get("services").chargingPoints.startTransaction(id, input));
  }

  async reportMeterValue(context: Context<AppBindings>) {
    const { id, input } = await new ChargingPointRequestInput(context).reportMeterValue();
    return ok(context, await context.get("services").chargingPoints.reportMeterValue(id, input));
  }

  async stopTransaction(context: Context<AppBindings>) {
    const { id, input } = await new ChargingPointRequestInput(context).stopTransaction();
    return ok(context, await context.get("services").chargingPoints.stopTransaction(id, input));
  }

  async listEvents(context: Context<AppBindings>) {
    const { id, query } = new ChargingPointRequestInput(context).eventsQuery();
    return ok(context, await context.get("services").events.listByChargingPoint(id, query));
  }
}
