import type { Ocpp16RequestOf } from "../../../validator/Ocpp16";
import type { Transaction } from "../../../../model";
import { cloneDate } from "../../../../shared/utils";
import { createMeterValue } from "../payloadBuilders";
import { emitTransactionMeterValue } from "../events";
import { requireOcppConnectorId } from "../resourceAccess";
import { requireConnectorSelection } from "../connectorSelection";
import { traceOcpp16RuntimeOperation } from "../actorLogs";
import { getUnexpectedResponseFields, toRequestErrorInfo } from "../requestErrors";
import type { Ocpp16RuntimeContext } from "../state";
import type {
  Ocpp16MeterValueInput,
  Ocpp16MeterValuesResult,
} from "../types";
import {
  calculateNextMeterWh,
  isOfflineDeliveryError,
  prepareMeterValueDelivery,
  recordMeterValueForOfflineDelivery,
  resolveConnectorMeasurements,
  shouldQueueTransactionDelivery,
} from "../transactionDeliveryState";

type MeterValueReadingContext = "Sample.Periodic" | "Trigger";

export async function reportMeterValue(
  context: Ocpp16RuntimeContext,
  input: Ocpp16MeterValueInput,
): Promise<Ocpp16MeterValuesResult> {
  return traceOcpp16RuntimeOperation(
    context,
    {
      category: "action",
      name: "MeterValues",
      input,
    },
    () => reportMeterValueWithContext(context, {
      ...input,
      readingContext: "Sample.Periodic",
    }),
  );
}

export async function reportTriggeredMeterValue(
  context: Ocpp16RuntimeContext,
  input: {
    connectorId: number;
    meterWh: number;
    sampledAt?: Date;
  },
): Promise<void> {
  return traceOcpp16RuntimeOperation(
    context,
    {
      category: "action",
      name: "MeterValues",
      input,
    },
    () => reportTriggeredMeterValueCore(context, input),
  );
}

async function reportTriggeredMeterValueCore(
  context: Ocpp16RuntimeContext,
  input: {
    connectorId: number;
    meterWh: number;
    sampledAt?: Date;
  },
): Promise<void> {
  const at = input.sampledAt ?? context.clock();
  try {
    const selection = requireConnectorSelection(context, input.connectorId);
    await context.session.request("MeterValues", {
      connectorId: input.connectorId,
      meterValue: [
        createMeterValue(
          input.meterWh,
          at,
          "Trigger",
          resolveConnectorMeasurements(selection.connector),
        ),
      ],
    } satisfies Ocpp16RequestOf<"MeterValues">);
  } catch {
    // TriggerMessage 已回复 Accepted，触发消息发送失败不回改命令响应。
  }
}

async function reportMeterValueWithContext(
  context: Ocpp16RuntimeContext,
  input: Ocpp16MeterValueInput & {
    readingContext: MeterValueReadingContext;
  },
): Promise<Ocpp16MeterValuesResult> {
  const at = input.sampledAt ?? context.clock();
  const {
    binding: deliveryBinding,
    measurements,
    transaction: updatedTransaction,
  } = prepareMeterValueDelivery(context, input);
  if (deliveryBinding.status === "offline") {
    return recordMeterValueForOfflineDelivery(context, {
      transaction: updatedTransaction,
      ocppConnectorId: null,
      ocppTransactionId: null,
      meterWh: input.meterWh,
      sampledAt: at,
      measurements,
    });
  }

  const ocppTransactionId = deliveryBinding.ocppTransactionId;
  const connectorId = requireOcppConnectorId(context, updatedTransaction);
  if (shouldQueueTransactionDelivery(context, input.transactionId)) {
    return recordMeterValueForOfflineDelivery(context, {
      transaction: updatedTransaction,
      ocppConnectorId: connectorId,
      ocppTransactionId,
      meterWh: input.meterWh,
      sampledAt: at,
      measurements,
    });
  }

  const sentAt = context.clock();

  try {
    const result = await context.session.request("MeterValues", {
      connectorId,
      transactionId: ocppTransactionId,
      meterValue: [
        createMeterValue(
          input.meterWh,
          at,
          input.readingContext,
          measurements,
        ),
      ],
    } satisfies Ocpp16RequestOf<"MeterValues">);

    if (result.kind === "error") {
      return recordMeterValuesFailure(context, {
        transactionId: input.transactionId,
        connectorId,
        ocppTransactionId,
        meterWh: input.meterWh,
        sampledAt: at,
        sentAt,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    const meterValuesResult = recordMeterValuesSuccess(context, {
      transactionId: input.transactionId,
      connectorId,
      ocppTransactionId,
      meterWh: input.meterWh,
      measurements,
      sampledAt: at,
      sentAt,
      payload: result.payload,
    });
    emitAcceptedMeterValue(context, updatedTransaction, meterValuesResult);

    return meterValuesResult;
  } catch (cause) {
    if (isOfflineDeliveryError(cause)) {
      return recordMeterValueForOfflineDelivery(context, {
        transaction: updatedTransaction,
        ocppConnectorId: connectorId,
        ocppTransactionId,
        meterWh: input.meterWh,
        sampledAt: at,
        measurements,
      });
    }

    return recordMeterValuesFailure(context, {
      transactionId: input.transactionId,
      connectorId,
      ocppTransactionId,
      meterWh: input.meterWh,
      sampledAt: at,
      sentAt,
      ...toRequestErrorInfo(cause),
    });
  }
}
function recordMeterValuesSuccess(
  context: Ocpp16RuntimeContext,
  input: {
    transactionId: string;
    connectorId: number;
    ocppTransactionId: number;
    meterWh: number;
    measurements: {
      powerW: number;
      currentA: number;
      voltageV: number;
    };
    sampledAt: Date;
    sentAt: Date;
    payload: unknown;
  },
): Extract<Ocpp16MeterValuesResult, { outcome: "Accepted" }> {
  const receivedAt = context.clock();
  const unexpectedResponseFields = getUnexpectedResponseFields(input.payload);

  return {
    outcome: "Accepted",
    transactionId: input.transactionId,
    connectorId: input.connectorId,
    ocppTransactionId: input.ocppTransactionId,
    meterWh: input.meterWh,
    powerW: input.measurements.powerW,
    currentA: input.measurements.currentA,
    voltageV: input.measurements.voltageV,
    sampledAt: cloneDate(input.sampledAt),
    sentAt: cloneDate(input.sentAt),
    receivedAt,
    unexpectedResponseFields,
    consecutiveFailures: 0,
    platformCommunicationStatus: "online",
    shouldReconnect: false,
  };
}

function emitAcceptedMeterValue(
  context: Ocpp16RuntimeContext,
  transaction: Transaction,
  result: Extract<Ocpp16MeterValuesResult, { outcome: "Accepted" }>,
): void {
  const target = transaction.target;
  if (target.scope !== "connector") {
    return;
  }

  emitTransactionMeterValue(context, {
    evseId: target.evseId,
    connectorId: target.connectorId,
    transactionId: result.transactionId,
    meterWh: result.meterWh,
    powerW: result.powerW,
    currentA: result.currentA,
    voltageV: result.voltageV,
    sampledAt: result.sampledAt,
    occurredAt: result.receivedAt,
  });
}

export function startMeterValueLoop(
  context: Ocpp16RuntimeContext,
  transactionId: string,
): void {
  if (context.meterValueLoops.has(transactionId)) {
    return;
  }

  const intervalSec = context.configurationFacts.getMeterValueSampleIntervalSec();
  if (intervalSec === 0) {
    return;
  }

  const loop = {
    timerId: setInterval(() => {
      void reportPeriodicMeterValue(context, transactionId);
    }, intervalSec * 1_000),
    isReporting: false,
    intervalSec,
  };
  unrefTimer(loop.timerId);
  context.meterValueLoops.set(transactionId, loop);
}

export function stopMeterValueLoop(
  context: Ocpp16RuntimeContext,
  transactionId: string,
): void {
  const loop = context.meterValueLoops.get(transactionId);
  if (loop === undefined) {
    return;
  }

  clearInterval(loop.timerId);
  context.meterValueLoops.delete(transactionId);
}

export function stopMeterValueLoops(context: Ocpp16RuntimeContext): void {
  for (const transactionId of [...context.meterValueLoops.keys()]) {
    stopMeterValueLoop(context, transactionId);
  }
}

export function restartActiveMeterValueLoops(context: Ocpp16RuntimeContext): void {
  const activeTransactionIds = [...context.transactions.values()]
    .filter((transaction) => transaction.state === "active")
    .map((transaction) => transaction.id);

  stopMeterValueLoops(context);
  for (const transactionId of activeTransactionIds) {
    startMeterValueLoop(context, transactionId);
  }
}

async function reportPeriodicMeterValue(
  context: Ocpp16RuntimeContext,
  transactionId: string,
): Promise<void> {
  const loop = context.meterValueLoops.get(transactionId);
  if (loop === undefined || loop.isReporting) {
    return;
  }

  const transaction = context.transactions.get(transactionId);
  if (transaction === undefined || transaction.state === "ended") {
    stopMeterValueLoop(context, transactionId);
    return;
  }

  loop.isReporting = true;
  try {
    const sampledAt = context.clock();
    await reportMeterValue(context, {
        transactionId,
        meterWh: calculateNextMeterWh(context, {
          transaction,
          intervalSec: loop.intervalSec,
      }),
      sampledAt,
    });
  } catch {
    // 周期 MeterValues 失败不改变交易状态，等待下一周期继续尝试。
  } finally {
    const currentLoop = context.meterValueLoops.get(transactionId);
    if (currentLoop === loop) {
      currentLoop.isReporting = false;
    }
  }
}

function unrefTimer(timerId: ReturnType<typeof setInterval>): void {
  if (
    typeof timerId === "object" &&
    timerId !== null &&
    "unref" in timerId
  ) {
    (timerId as { unref(): void }).unref();
  }
}

function recordMeterValuesFailure(
  context: Ocpp16RuntimeContext,
  input: {
    transactionId: string;
    connectorId: number;
    ocppTransactionId: number;
    meterWh: number;
    sampledAt: Date;
    sentAt: Date;
    errorCode: string;
    errorMessage: string;
  },
): Extract<Ocpp16MeterValuesResult, { outcome: "Failed" }> {
  const failedAt = context.clock();

  return {
    outcome: "Failed",
    transactionId: input.transactionId,
    connectorId: input.connectorId,
    ocppTransactionId: input.ocppTransactionId,
    meterWh: input.meterWh,
    sampledAt: cloneDate(input.sampledAt),
    sentAt: cloneDate(input.sentAt),
    failedAt,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    consecutiveFailures: 1,
    platformCommunicationStatus: "unknown",
    shouldReconnect: false,
  };
}
