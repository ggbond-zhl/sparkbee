import type { Context } from "hono";

import type { AppBindings } from "../types/app";
import {
  authorizeSchema,
  connectorParamSchema,
  createStationSchema,
  meterValueSchema,
  startTransactionSchema,
  stationEventQuerySchema,
  stationIdParamSchema,
  stopTransactionSchema,
  transactionParamSchema,
  updateStationSchema
} from "../validators/station.validator";
import { parseJson, parseParams, parseQuery } from "../validators/parse";

export class StationRequestInput {
  constructor(private readonly context: Context<AppBindings>) {}

  createStation() {
    return parseJson(this.context, createStationSchema);
  }

  async updateStation() {
    return {
      id: this.stationId(),
      input: await parseJson(this.context, updateStationSchema),
    };
  }

  stationId(): string {
    return parseParams(this.context, stationIdParamSchema).id;
  }

  connectorAction() {
    return parseParams(this.context, connectorParamSchema);
  }

  async authorize() {
    return {
      id: this.stationId(),
      input: await parseJson(this.context, authorizeSchema),
    };
  }

  async startTransaction() {
    return {
      id: this.stationId(),
      input: await parseJson(this.context, startTransactionSchema),
    };
  }

  async reportMeterValue() {
    const { id, transactionId } = parseParams(this.context, transactionParamSchema);
    const input = await parseJson(this.context, meterValueSchema);

    return {
      id,
      input: {
        transactionId,
        meterWh: input.meterWh,
        sampledAt: input.sampledAt === undefined ? undefined : new Date(input.sampledAt),
      },
    };
  }

  async stopTransaction() {
    const { id, transactionId } = parseParams(this.context, transactionParamSchema);
    const input = await parseJson(this.context, stopTransactionSchema);

    return {
      id,
      input: {
        ...input,
        transactionId,
      },
    };
  }

  eventsQuery() {
    return {
      id: this.stationId(),
      query: parseQuery(this.context, stationEventQuerySchema),
    };
  }
}
