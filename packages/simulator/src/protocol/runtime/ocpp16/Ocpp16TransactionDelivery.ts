import {
  type AuthorizationSource,
  type Connector,
  Transaction,
  type TransactionStopReason,
} from "../../../model";
import { createConnectorRef } from "../../../model/shared";
import { cloneDate } from "../../../shared/utils";
import type { ConnectorSelection } from "./connectorSelection";
import { ProtocolRuntimeError } from "./errors";
import type { MeterValueElectricalMeasurements } from "./payloadBuilders";
import type {
  Ocpp16MeterValueInput,
  Ocpp16MeterValuesResult,
  Ocpp16StartTransactionInput,
  Ocpp16StopTransactionInput,
  Ocpp16StopTransactionResult,
  Ocpp16TransactionStartResult,
} from "./types";
import type { Ocpp16RuntimeContext } from "./state";
import {
  reportMeterValue,
  reportTriggeredMeterValue,
  restartActiveMeterValueLoops,
  stopMeterValueLoops,
} from "./actions/meterValues";
import {
  bindEvseTransaction,
  releaseTransactionOnConnector,
} from "./resourceAccess";
import { replayOfflineTransactions } from "./actions/offlineTransactionReplay";
import { stopTransaction } from "./actions/stopTransaction";
import { startTransaction } from "./actions/transactionStart";
import {
  recordOfflineTransactionStart,
  recordOfflineTransactionStop,
} from "./actions/offlineTransactionDelivery";

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

export type TransactionConnectorRef = {
  evseId: number;
  connectorId: number;
};

export type StartedTransactionDelivery = {
  transactionId: string;
  transaction: Transaction;
};

export type EndedTransactionDelivery = {
  endedTransaction: Transaction;
  previousTransactionStatus: Transaction["state"];
  meterStop: number;
  stoppedAt: Date;
  idTag: string | null;
};

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

export function toOcppMeterReadingWh(meterWh: number): number {
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
