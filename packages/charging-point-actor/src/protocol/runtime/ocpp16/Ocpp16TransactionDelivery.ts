import type { Ocpp16RuntimeContext } from "./state";
import { traceOcpp16RuntimeOperation } from "./actorLogs";
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
import { stopTransaction } from "./actions/stopTransaction";
import { startTransaction } from "./actions/transactionStart";
import { TransactionDeliveryDispatcher } from "./TransactionDeliveryDispatcher";

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
  private readonly dispatcher: TransactionDeliveryDispatcher;

  constructor(private readonly context: Ocpp16RuntimeContext) {
    this.dispatcher = new TransactionDeliveryDispatcher(context);
    context.wakeTransactionDelivery = () => this.dispatcher.wake();
  }

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
      async () => {
        const result = await startTransaction(this.context, input, options);
        if (result.status === "Accepted") {
          this.dispatcher.wake();
        }
        return result;
      },
    );
  }

  recordMeterValue(
    input: Ocpp16MeterValueInput,
  ): Promise<Ocpp16MeterValuesResult> {
    return reportMeterValue(this.context, input).then((result) => {
      if (result.outcome === "Accepted") {
        this.dispatcher.wake();
      }
      return result;
    });
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
      async () => {
        const result = await stopTransaction(this.context, input);
        if (result.outcome === "Accepted") {
          this.dispatcher.wake();
        }
        return result;
      },
    );
  }

  replayPending(): Promise<void> {
    return traceOcpp16RuntimeOperation(
      this.context,
      {
        category: "action",
        name: "OfflineTransactionReplay",
      },
      () => this.dispatcher.drain(),
    );
  }

  wake(): void {
    this.dispatcher.wake();
  }

  recoverInterrupted(): Promise<unknown[]> {
    return this.dispatcher.recoverInterrupted();
  }

  applyMeterValueSampleIntervalChange(): void {
    restartActiveMeterValueLoops(this.context);
  }

  stopAll(): void {
    stopMeterValueLoops(this.context);
    this.dispatcher.stop();
  }
}
