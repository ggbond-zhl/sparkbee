import type { Ocpp16RequestOf } from "../../../validator/Ocpp16";
import type { Transaction } from "../../../../model";
import { cloneDate } from "../../../../shared/utils";
import { createMeterValue } from "../payloadBuilders";
import { emitTransactionMeterValue } from "../events";
import { requireOcppConnectorId } from "../resourceAccess";
import { requireConnectorSelection } from "../connectorSelection";
import { traceOcpp16RuntimeOperation } from "../actorLogs";
import type { Ocpp16RuntimeContext } from "../state";
import type {
  Ocpp16MeterValueInput,
  Ocpp16MeterValuesResult,
} from "../types";
import {
  calculateNextMeterWh,
  prepareMeterValueDelivery,
  resolveConnectorMeasurements,
} from "../transactionDeliveryState";
import { emitTransactionDeliveryChanged } from "../transactionDeliveryEvents";

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
  const previousTransaction = context.transactions.get(input.transactionId);
  const {
    measurements,
    transaction: updatedTransaction,
  } = prepareMeterValueDelivery(context, input);
  const connectorId = requireOcppConnectorId(context, updatedTransaction);
  try {
    const deliveryRecord = await context.transactionStore.recordSample({
      sampleId: context.messageIdGenerator(),
      transactionId: updatedTransaction.id,
      sampledAt: at,
      meterWh: input.meterWh,
      powerW: measurements.powerW,
      currentA: measurements.currentA,
      voltageV: measurements.voltageV,
      messageId: context.messageIdGenerator(),
      payload: {
        connectorId,
        meterWh: input.meterWh,
        powerW: measurements.powerW,
        currentA: measurements.currentA,
        voltageV: measurements.voltageV,
      },
    });
    emitTransactionDeliveryChanged(context, deliveryRecord, null);
  } catch (error) {
    if (previousTransaction !== undefined) {
      context.transactions.set(previousTransaction.id, previousTransaction);
    }
    throw error;
  }
  emitPersistedMeterValue(context, updatedTransaction, {
    meterWh: input.meterWh,
    measurements,
    sampledAt: at,
    occurredAt: context.clock(),
  });
  return {
    outcome: "Accepted",
    transactionId: input.transactionId,
    connectorId,
    ocppTransactionId:
      context.ocppTransactionIds.get(input.transactionId) ?? null,
    meterWh: input.meterWh,
    powerW: measurements.powerW,
    currentA: measurements.currentA,
    voltageV: measurements.voltageV,
    sampledAt: cloneDate(at),
    sentAt: cloneDate(at),
    receivedAt: cloneDate(at),
    unexpectedResponseFields: [],
    consecutiveFailures: 0,
    platformCommunicationStatus: context.session.isConnected()
      ? "online"
      : "offline",
    shouldReconnect: false,
  };
}
function emitPersistedMeterValue(
  context: Ocpp16RuntimeContext,
  transaction: Transaction,
  input: {
    meterWh: number;
    measurements: {
      powerW: number;
      currentA: number;
      voltageV: number;
    };
    sampledAt: Date;
    occurredAt: Date;
  },
): void {
  const target = transaction.target;
  if (target.scope !== "connector") {
    return;
  }

  emitTransactionMeterValue(context, {
    evseId: target.evseId,
    connectorId: target.connectorId,
    transactionId: transaction.id,
    meterWh: input.meterWh,
    powerW: input.measurements.powerW,
    currentA: input.measurements.currentA,
    voltageV: input.measurements.voltageV,
    sampledAt: input.sampledAt,
    occurredAt: input.occurredAt,
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
    const result = await reportMeterValue(context, {
      transactionId,
      meterWh: calculateNextMeterWh(context, {
        transaction,
        intervalSec: loop.intervalSec,
      }),
      sampledAt,
    });
    if (result.outcome === "Accepted") {
      context.wakeTransactionDelivery();
    }
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
