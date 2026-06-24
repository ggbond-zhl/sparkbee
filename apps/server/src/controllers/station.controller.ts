import type { Context } from "hono";

import type { AppBindings } from "../types/app";
import { created, noContent, ok } from "../utils/response";
import { StationRequestInput } from "./station-request-input";

export class StationController {
  async list(context: Context<AppBindings>) {
    return ok(context, await context.get("services").stations.listStations());
  }

  async create(context: Context<AppBindings>) {
    const input = await new StationRequestInput(context).createStation();
    return created(context, await context.get("services").stations.createStation(input));
  }

  async get(context: Context<AppBindings>) {
    const id = new StationRequestInput(context).stationId();
    return ok(context, await context.get("services").stations.getStation(id));
  }

  async update(context: Context<AppBindings>) {
    const { id, input } = await new StationRequestInput(context).updateStation();
    return ok(context, await context.get("services").stations.updateStation(id, input));
  }

  async delete(context: Context<AppBindings>) {
    const id = new StationRequestInput(context).stationId();
    await context.get("services").stations.deleteStation(id);
    return noContent(context);
  }

  async start(context: Context<AppBindings>) {
    const id = new StationRequestInput(context).stationId();
    return ok(context, await context.get("services").stations.startStation(id));
  }

  async stop(context: Context<AppBindings>) {
    const id = new StationRequestInput(context).stationId();
    await context.get("services").stations.stopStation(id);
    return noContent(context);
  }

  async plug(context: Context<AppBindings>) {
    const { id, connectorId } = new StationRequestInput(context).connectorAction();
    return ok(context, await context.get("services").stations.plug(id, connectorId));
  }

  async unplug(context: Context<AppBindings>) {
    const { id, connectorId } = new StationRequestInput(context).connectorAction();
    return ok(context, await context.get("services").stations.unplug(id, connectorId));
  }

  async authorize(context: Context<AppBindings>) {
    const { id, input } = await new StationRequestInput(context).authorize();
    return ok(context, await context.get("services").stations.authorize(id, input));
  }

  async startTransaction(context: Context<AppBindings>) {
    const { id, input } = await new StationRequestInput(context).startTransaction();
    return ok(context, await context.get("services").stations.startTransaction(id, input));
  }

  async reportMeterValue(context: Context<AppBindings>) {
    const { id, input } = await new StationRequestInput(context).reportMeterValue();
    return ok(context, await context.get("services").stations.reportMeterValue(id, input));
  }

  async stopTransaction(context: Context<AppBindings>) {
    const { id, input } = await new StationRequestInput(context).stopTransaction();
    return ok(context, await context.get("services").stations.stopTransaction(id, input));
  }

  async listEvents(context: Context<AppBindings>) {
    const { id, query } = new StationRequestInput(context).eventsQuery();
    return ok(context, await context.get("services").events.listByStation(id, query));
  }
}
