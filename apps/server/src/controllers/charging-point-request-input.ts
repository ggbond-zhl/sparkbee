import type { Context } from "hono";

import type { AppBindings } from "../types/app";
import {
  authorizeSchema,
  connectorParamSchema,
  createChargingPointSchema,
  meterValueSchema,
  startTransactionSchema,
  chargingPointEventQuerySchema,
  chargingPointIdParamSchema,
  stopTransactionSchema,
  transactionParamSchema,
  updateChargingPointSchema
} from "../validators/charging-point.validator";
import { parseJson, parseParams, parseQuery } from "../validators/parse";

export class ChargingPointRequestInput {
  constructor(private readonly context: Context<AppBindings>) {}

  createChargingPoint() {
    return parseJson(this.context, createChargingPointSchema);
  }

  async updateChargingPoint() {
    return {
      id: this.chargingPointId(),
      input: await parseJson(this.context, updateChargingPointSchema),
    };
  }

  chargingPointId(): string {
    return parseParams(this.context, chargingPointIdParamSchema).id;
  }

  connectorAction() {
    return parseParams(this.context, connectorParamSchema);
  }

  async authorize() {
    return {
      id: this.chargingPointId(),
      input: await parseJson(this.context, authorizeSchema),
    };
  }

  async startTransaction() {
    return {
      id: this.chargingPointId(),
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
      id: this.chargingPointId(),
      query: parseQuery(this.context, chargingPointEventQuerySchema),
    };
  }
}
