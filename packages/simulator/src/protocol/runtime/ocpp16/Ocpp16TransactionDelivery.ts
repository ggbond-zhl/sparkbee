import {
  type AuthorizationSource,
  type Connector,
  Transaction,
  type TransactionStopReason,
} from "../../../model";
import { createConnectorRef } from "../../../model/shared";
import { cloneDate } from "../../../shared/utils";
import { SessionError } from "../../session/types";
import type { ConnectorSelection } from "./connectorSelection";
import { ProtocolRuntimeError } from "./errors";
import { emitTransactionMeterValue } from "./events";
import type { MeterValueElectricalMeasurements } from "./payloadBuilders";
import {
  bindEvseTransaction,
  releaseTransactionOnConnector,
  resolveOcppTransactionId,
} from "./resourceAccess";
import type { Ocpp16RuntimeContext } from "./state";
import type {
  Ocpp16MeterValueInput,
  Ocpp16MeterValuesResult,
  Ocpp16StartTransactionInput,
  Ocpp16StopTransactionInput,
  Ocpp16StopTransactionResult,
  Ocpp16TransactionStartResult,
} from "./types";
import type { OfflineTransactionRecord } from "./OfflineTransactionOutbox";
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
    return startTransaction(this.context, input, options);
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
    return stopTransaction(this.context, input);
  }

  replayPending(): Promise<void> {
    return replayOfflineTransactions(this.context);
  }

  applyMeterValueSampleIntervalChange(): void {
    restartActiveMeterValueLoops(this.context);
  }

  stopAll(): void {
    stopMeterValueLoops(this.context);
  }
}

type TransactionConnectorRef = {
  evseId: number;
  connectorId: number;
};

type StartedTransactionDelivery = {
  transactionId: string;
  transaction: Transaction;
};

type EndedTransactionDelivery = {
  endedTransaction: Transaction;
  previousTransactionStatus: Transaction["state"];
  meterStop: number;
  stoppedAt: Date;
  idTag: string | null;
};

type TransactionDeliveryBinding =
  | { status: "bound"; ocppTransactionId: number }
  | { status: "offline"; ocppTransactionId: null };

export function recordOnlineTransactionStart(
  context: Ocpp16RuntimeContext,
  input: {
    selection: ConnectorSelection;
    startInput: Ocpp16StartTransactionInput;
    ocppTransactionId: number;
    startedAt: Date;
  },
): StartedTransactionDelivery {
  const transactionId = String(input.ocppTransactionId);
  const transaction = createActiveTransaction(context, {
    transactionId,
    selection: input.selection,
    idTag: input.startInput.idTag,
    meterStartWh: input.startInput.meterStartWh,
    startedAt: input.startedAt,
  });

  return { transactionId, transaction };
}

export function recordOfflineTransactionStartDelivery(
  context: Ocpp16RuntimeContext,
  input: {
    selection: ConnectorSelection;
    startInput: Ocpp16StartTransactionInput;
    startedAt: Date;
    authorizationSource: AuthorizationSource | undefined;
  },
): StartedTransactionDelivery {
  const transactionId = context.idGenerator();
  const transaction = createActiveTransaction(context, {
    transactionId,
    selection: input.selection,
    idTag: input.startInput.idTag,
    meterStartWh: input.startInput.meterStartWh,
    startedAt: input.startedAt,
  });

  recordOfflineTransactionStart(context, {
    localTransactionId: transactionId,
    evseId: input.selection.evseId,
    connectorId: input.selection.connectorId,
    ocppConnectorId: input.selection.ocppConnectorId,
    idTag: input.startInput.idTag,
    meterStartWh: input.startInput.meterStartWh,
    reservationId: input.startInput.reservationId,
    startedAt: input.startedAt,
    authorizationSource: input.authorizationSource,
  });

  return { transactionId, transaction };
}

export function requireTransactionConnectorRef(
  transaction: Transaction,
): TransactionConnectorRef {
  const target = transaction.target;
  if (target.scope !== "connector") {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      "OCPP 1.6 交易必须绑定到 connector",
    );
  }

  return {
    evseId: target.evseId,
    connectorId: target.connectorId,
  };
}

export function endTransactionDelivery(
  context: Ocpp16RuntimeContext,
  input: {
    transaction: Transaction;
    connectorRef: TransactionConnectorRef;
    reason: TransactionStopReason;
    stoppedAt: Date;
    meterStopWh?: number;
    idTag?: string;
  },
): EndedTransactionDelivery {
  const meterStop = toOcppMeterReadingWh(
    input.meterStopWh ?? input.transaction.latestMeterWh,
  );
  const idTag = input.idTag ?? input.transaction.credentialId;
  const previousTransactionStatus = input.transaction.state;
  const endedTransaction = input.transaction
    .recordMeterValue(meterStop)
    .end(input.reason, input.stoppedAt, meterStop);

  context.transactions.set(endedTransaction.id, endedTransaction);
  releaseTransactionOnConnector(context, input.connectorRef, input.stoppedAt);

  return {
    endedTransaction,
    previousTransactionStatus,
    meterStop,
    stoppedAt: cloneDate(input.stoppedAt),
    idTag,
  };
}

export function recordOfflineTransactionStopDelivery(
  context: Ocpp16RuntimeContext,
  input: {
    transaction: Transaction;
    connectorRef: TransactionConnectorRef;
    reason: TransactionStopReason;
    stoppedAt: Date;
    meterStopWh?: number;
    idTag?: string;
  },
): EndedTransactionDelivery {
  const delivery = endTransactionDelivery(context, input);
  recordOfflineTransactionStop(context, delivery.endedTransaction.id, {
    meterStopWh: delivery.meterStop,
    stoppedAt: delivery.stoppedAt,
    reason: input.reason,
    idTag: delivery.idTag,
  });

  return delivery;
}

export function resolveTransactionDeliveryBinding(
  context: Ocpp16RuntimeContext,
  transaction: Transaction,
): TransactionDeliveryBinding {
  try {
    return {
      status: "bound",
      ocppTransactionId: resolveOcppTransactionId(context, transaction),
    };
  } catch (cause) {
    if (context.offlineTransactionOutbox.get(transaction.id) === undefined) {
      throw cause;
    }

    return {
      status: "offline",
      ocppTransactionId: null,
    };
  }
}

export function shouldQueueTransactionDelivery(
  context: Ocpp16RuntimeContext,
  transactionId: string,
): boolean {
  return (
    !context.session.isConnected() ||
    context.offlineTransactionReplayInProgress ||
    listPendingOfflineTransactions(context).some((record) =>
      record.localTransactionId === transactionId
    )
  );
}

export function recordMeterValueForOfflineDelivery(
  context: Ocpp16RuntimeContext,
  input: {
    transaction: Transaction;
    ocppConnectorId: number | null;
    ocppTransactionId: number | null;
    meterWh: number;
    sampledAt: Date;
    measurements: MeterValueElectricalMeasurements;
  },
): Extract<Ocpp16MeterValuesResult, { outcome: "Accepted" }> {
  if (input.ocppTransactionId !== null && input.ocppConnectorId !== null) {
    ensureBoundTransactionOutboxRecord(context, {
      transaction: input.transaction,
      connectorId: input.ocppConnectorId,
      ocppTransactionId: input.ocppTransactionId,
    });
  }

  context.offlineTransactionOutbox.recordMeterValue(input.transaction.id, {
    meterWh: input.meterWh,
    sampledAt: input.sampledAt,
    measurements: input.measurements,
  });

  const result = recordOfflineMeterValuesSuccess({
    transactionId: input.transaction.id,
    connectorId: input.ocppConnectorId ??
      resolveTransactionConnectorId(input.transaction),
    ocppTransactionId: input.ocppTransactionId,
    meterWh: input.meterWh,
    sampledAt: input.sampledAt,
  });
  emitAcceptedOfflineMeterValue(context, input.transaction, result);

  return result;
}

export function bindOfflineTransactionStart(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
  input: { ocppTransactionId: number },
): void {
  context.offlineTransactionOutbox.bindStart(localTransactionId, input);
  recordOcppTransactionBinding(context, localTransactionId, input);
}

export function recordOcppTransactionBinding(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
  input: { ocppTransactionId: number },
): void {
  context.ocppTransactionIds.set(localTransactionId, input.ocppTransactionId);
}

export function listPendingOfflineTransactions(
  context: Ocpp16RuntimeContext,
): OfflineTransactionRecord[] {
  return context.offlineTransactionOutbox.listPending();
}

export function getOfflineTransactionRecord(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
): OfflineTransactionRecord | undefined {
  return context.offlineTransactionOutbox.get(localTransactionId);
}

export function markOfflineMeterValueReplayed(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
  index: number,
): void {
  context.offlineTransactionOutbox.markMeterValueReplayed(
    localTransactionId,
    index,
  );
}

export function markOfflineStopReplayed(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
): void {
  context.offlineTransactionOutbox.markStopReplayed(localTransactionId);
}

export function isOfflineDeliveryError(cause: unknown): boolean {
  return (
    cause instanceof SessionError &&
    (
      cause.code === "OUTBOUND_REQUEST_REJECTED" ||
      cause.code === "OUTBOUND_REQUEST_ABORTED" ||
      cause.code === "OUTBOUND_REQUEST_DISCONNECTED"
    )
  );
}

function recordOfflineTransactionStart(
  context: Ocpp16RuntimeContext,
  input: Parameters<
    Ocpp16RuntimeContext["offlineTransactionOutbox"]["recordStarted"]
  >[0],
): void {
  context.offlineTransactionOutbox.recordStarted(input);
}

function recordOfflineTransactionStop(
  context: Ocpp16RuntimeContext,
  localTransactionId: string,
  record: {
    meterStopWh: number;
    stoppedAt: Date;
    reason: TransactionStopReason;
    idTag: string | null;
  },
): void {
  context.offlineTransactionOutbox.recordStopped(localTransactionId, record);
}

function toOcppMeterReadingWh(meterWh: number): number {
  if (!Number.isFinite(meterWh) || meterWh < 0) {
    return meterWh;
  }

  return Math.ceil(meterWh);
}

export function recordTransactionMeterValue(
  context: Ocpp16RuntimeContext,
  input: { transactionId: string; meterWh: number },
): Transaction {
  const transaction = context.transactions.get(input.transactionId);
  if (transaction === undefined) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_TRANSACTION_NOT_FOUND",
      `充电交易 ${input.transactionId} 不存在`,
    );
  }

  const updatedTransaction = transaction.recordMeterValue(input.meterWh);
  context.transactions.set(input.transactionId, updatedTransaction);
  return updatedTransaction;
}

export function calculateNextMeterWh(
  context: Ocpp16RuntimeContext,
  input: {
    transaction: Transaction;
    intervalSec: number;
  },
): number {
  const powerW = resolveTransactionPowerW(context, input.transaction);
  return input.transaction.latestMeterWh + powerW * input.intervalSec / 3_600;
}

export function resolveTransactionMeasurements(
  context: Ocpp16RuntimeContext,
  transaction: Transaction,
): MeterValueElectricalMeasurements {
  const target = transaction.target;
  if (target.scope !== "connector") {
    return emptyMeasurements();
  }

  const connector = context.chargingPoint.getConnector(
    target.evseId,
    target.connectorId,
  );
  if (connector === undefined) {
    return emptyMeasurements();
  }

  return resolveConnectorMeasurements(connector);
}

export function resolveConnectorMeasurements(
  connector: Connector,
): MeterValueElectricalMeasurements {
  const voltageV = connector.maxVoltage ?? 0;
  const currentA = connector.maxCurrent ?? 0;
  const powerW = connector.maxPower ?? voltageV * currentA;

  return {
    powerW,
    currentA,
    voltageV,
  };
}

function ensureBoundTransactionOutboxRecord(
  context: Ocpp16RuntimeContext,
  input: {
    transaction: Transaction;
    connectorId: number;
    ocppTransactionId: number;
  },
): void {
  if (context.offlineTransactionOutbox.get(input.transaction.id) !== undefined) {
    return;
  }

  const target = input.transaction.target;
  if (target.scope !== "connector") {
    return;
  }

  context.offlineTransactionOutbox.recordBoundStarted({
    localTransactionId: input.transaction.id,
    evseId: target.evseId,
    connectorId: target.connectorId,
    ocppConnectorId: input.connectorId,
    idTag: input.transaction.credentialId,
    meterStartWh: input.transaction.startMeterWh,
    startedAt: input.transaction.startedAt,
    ocppTransactionId: input.ocppTransactionId,
  });
}

function recordOfflineMeterValuesSuccess(input: {
  transactionId: string;
  connectorId: number;
  ocppTransactionId: number | null;
  meterWh: number;
  sampledAt: Date;
}): Extract<Ocpp16MeterValuesResult, { outcome: "Accepted" }> {
  return {
    outcome: "Accepted",
    transactionId: input.transactionId,
    connectorId: input.connectorId,
    ocppTransactionId: input.ocppTransactionId,
    meterWh: input.meterWh,
    sampledAt: cloneDate(input.sampledAt),
    sentAt: cloneDate(input.sampledAt),
    receivedAt: cloneDate(input.sampledAt),
    unexpectedResponseFields: [],
    consecutiveFailures: 0,
    platformCommunicationStatus: "offline",
    shouldReconnect: false,
  };
}

function emitAcceptedOfflineMeterValue(
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
    sampledAt: result.sampledAt,
    occurredAt: result.receivedAt,
  });
}

function resolveTransactionConnectorId(transaction: Transaction): number {
  const target = transaction.target;
  return target.scope === "connector" ? target.connectorId : 0;
}

function createActiveTransaction(
  context: Ocpp16RuntimeContext,
  input: {
    transactionId: string;
    selection: TransactionConnectorRef;
    idTag: string;
    meterStartWh: number;
    startedAt: Date;
  },
): Transaction {
  const transaction = new Transaction({
    id: input.transactionId,
    target: createConnectorRef(
      context.chargingPoint.id,
      input.selection.evseId,
      input.selection.connectorId,
    ),
    credentialId: input.idTag,
    startedAt: input.startedAt,
    startMeterWh: input.meterStartWh,
    latestMeterWh: input.meterStartWh,
  }).startCharging();

  context.transactions.set(input.transactionId, transaction);
  bindEvseTransaction(
    context,
    input.selection,
    input.transactionId,
    input.startedAt,
  );

  return transaction;
}

function resolveTransactionPowerW(
  context: Ocpp16RuntimeContext,
  transaction: Transaction,
): number {
  return resolveTransactionMeasurements(context, transaction).powerW;
}

function emptyMeasurements(): MeterValueElectricalMeasurements {
  return {
    powerW: 0,
    currentA: 0,
    voltageV: 0,
  };
}
