import type { Ocpp16RuntimeContext } from "./state";
import { traceOcpp16RuntimeOperation } from "./runtimeLogs";
import type {
  Ocpp16MeterValueInput,
  Ocpp16MeterValuesResult,
  Ocpp16StartTransactionInput,
  Ocpp16StopTransactionInput,
  Ocpp16StopTransactionResult,
  Ocpp16TransactionStartResult,
} from "./types";
import {
  reportMeterValue,
  reportTriggeredMeterValue,
  restartActiveMeterValueLoops,
  stopMeterValueLoops,
} from "./actions/meterValues";
import { replayOfflineTransactions } from "./actions/offlineTransactionReplay";
import { stopTransaction } from "./actions/stopTransaction";
import { startTransaction } from "./actions/transactionStart";

const transactionDeliveries = new WeakMap<
  Ocpp16RuntimeContext,
  Ocpp16TransactionDelivery
>();

export function getOcpp16TransactionDelivery(
  context: Ocpp16RuntimeContext,
): Ocpp16TransactionDelivery {
  let delivery = transactionDeliveries.get(context);
  if (delivery === undefined) {
    delivery = new Ocpp16TransactionDelivery(context);
    transactionDeliveries.set(context, delivery);
  }

  return delivery;
}

export class Ocpp16TransactionDelivery {
  constructor(private readonly context: Ocpp16RuntimeContext) {}

  start(
    input: Ocpp16StartTransactionInput,
    options: { requireAuthorization: boolean } = { requireAuthorization: true },
  ): Promise<Ocpp16TransactionStartResult> {
    return traceOcpp16RuntimeOperation(
      this.context,
      {
        category: "action",
        name: "StartTransaction",
        input: { ...input, requireAuthorization: options.requireAuthorization },
      },
      () => startTransaction(this.context, input, options),
    );
  }

  recordMeterValue(
    input: Ocpp16MeterValueInput,
  ): Promise<Ocpp16MeterValuesResult> {
    return reportMeterValue(this.context, input);
  }

  recordTriggeredMeterValue(input: {
    connectorId: number;
    meterWh: number;
    sampledAt?: Date;
  }): Promise<void> {
    return reportTriggeredMeterValue(this.context, input);
  }

  stop(input: Ocpp16StopTransactionInput): Promise<Ocpp16StopTransactionResult> {
    return traceOcpp16RuntimeOperation(
      this.context,
      {
        category: "action",
        name: "StopTransaction",
        input,
      },
      () => stopTransaction(this.context, input),
    );
  }

  replayPending(): Promise<void> {
    return traceOcpp16RuntimeOperation(
      this.context,
      {
        category: "action",
        name: "OfflineTransactionReplay",
      },
      () => replayOfflineTransactions(this.context),
    );
  }

  applyMeterValueSampleIntervalChange(): void {
    restartActiveMeterValueLoops(this.context);
  }

  stopAll(): void {
    stopMeterValueLoops(this.context);
  }
}
