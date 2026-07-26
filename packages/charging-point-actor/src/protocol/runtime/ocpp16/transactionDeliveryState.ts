import {
  type Connector,
  Transaction,
  type TransactionStopReason,
} from "../../../model";
import { createConnectorRef } from "../../../model/shared";
import { cloneDate } from "../../../shared/utils";

import type { ConnectorSelection } from "./connectorSelection";
import { ProtocolRuntimeError } from "./errors";
import type { MeterValueElectricalMeasurements } from "./payloadBuilders";
import {
  bindEvseTransaction,
  releaseTransactionOnConnector,
} from "./resourceAccess";
import type { Ocpp16RuntimeContext } from "./state";
import type { Ocpp16StartTransactionInput } from "./types";

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

export function recordPersistedTransactionStart(
  context: Ocpp16RuntimeContext,
  input: {
    transactionId: string;
    selection: ConnectorSelection;
    startInput: Ocpp16StartTransactionInput;
    startedAt: Date;
  },
): StartedTransactionDelivery {
  return {
    transactionId: input.transactionId,
    transaction: createActiveTransaction(context, {
      transactionId: input.transactionId,
      selection: input.selection,
      idTag: input.startInput.idTag,
      meterStartWh: input.startInput.meterStartWh,
      startedAt: input.startedAt,
    }),
  };
}

export function endTransactionDelivery(
  context: Ocpp16RuntimeContext,
  input: {
    transaction: Transaction;
    connectorRef: TransactionConnectorRef;
    reason?: TransactionStopReason;
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

export function prepareMeterValueDelivery(
  context: Ocpp16RuntimeContext,
  input: { transactionId: string; meterWh: number },
): {
  transaction: Transaction;
  measurements: MeterValueElectricalMeasurements;
} {
  const transaction = recordTransactionMeterValue(context, input);
  return {
    transaction,
    measurements: resolveTransactionMeasurements(context, transaction),
  };
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
  const powerW = resolveTransactionMeasurements(context, input.transaction).powerW;
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
  return connector === undefined
    ? emptyMeasurements()
    : resolveConnectorMeasurements(connector);
}

export function resolveConnectorMeasurements(
  connector: Connector,
): MeterValueElectricalMeasurements {
  const voltageV = connector.maxVoltage ?? 0;
  const currentA = connector.maxCurrent ?? 0;
  return {
    powerW: voltageV * currentA,
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

export function toOcppMeterReadingWh(meterWh: number): number {
  return !Number.isFinite(meterWh) || meterWh < 0
    ? meterWh
    : Math.ceil(meterWh);
}

function emptyMeasurements(): MeterValueElectricalMeasurements {
  return { powerW: 0, currentA: 0, voltageV: 0 };
}
