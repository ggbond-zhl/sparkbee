import { cloneDate } from "../../../shared/utils";
import type { AuthorizationSource, TransactionStopReason } from "../../../model";
import type { MeterValueElectricalMeasurements } from "./payloadBuilders";

export interface OfflineTransactionStartRecord {
  localTransactionId: string;
  evseId: number;
  connectorId: number;
  ocppConnectorId: number;
  idTag: string;
  meterStartWh: number;
  reservationId?: number;
  startedAt: Date;
  authorizationSource?: AuthorizationSource;
}

export interface OfflineTransactionMeterValueRecord {
  meterWh: number;
  sampledAt: Date;
  measurements?: MeterValueElectricalMeasurements;
  replayed: boolean;
}

export interface OfflineTransactionStopRecord {
  meterStopWh: number;
  stoppedAt: Date;
  reason: TransactionStopReason;
  idTag: string | null;
  replayed: boolean;
}

export interface OfflineTransactionRecord extends OfflineTransactionStartRecord {
  startReplayed: boolean;
  ocppTransactionId: number | null;
  meterValues: OfflineTransactionMeterValueRecord[];
  stop: OfflineTransactionStopRecord | null;
}

export interface OfflineTransactionOutbox {
  recordStarted(record: OfflineTransactionStartRecord): void;
  recordBoundStarted(
    record: OfflineTransactionStartRecord & { ocppTransactionId: number },
  ): void;
  get(localTransactionId: string): OfflineTransactionRecord | undefined;
  recordMeterValue(
    localTransactionId: string,
    record: {
      meterWh: number;
      sampledAt: Date;
      measurements?: MeterValueElectricalMeasurements;
    },
  ): void;
  recordStopped(
    localTransactionId: string,
    record: {
      meterStopWh: number;
      stoppedAt: Date;
      reason: TransactionStopReason;
      idTag: string | null;
    },
  ): void;
  listPending(): OfflineTransactionRecord[];
  bindStart(
    localTransactionId: string,
    input: { ocppTransactionId: number },
  ): void;
  markMeterValueReplayed(localTransactionId: string, index: number): void;
  markStopReplayed(localTransactionId: string): void;
}

export class MemoryOfflineTransactionOutbox implements OfflineTransactionOutbox {
  private readonly records = new Map<string, OfflineTransactionRecord>();

  recordStarted(record: OfflineTransactionStartRecord): void {
    this.records.set(record.localTransactionId, {
      ...cloneStart(record),
      startReplayed: false,
      ocppTransactionId: null,
      meterValues: [],
      stop: null,
    });
  }

  recordBoundStarted(
    record: OfflineTransactionStartRecord & { ocppTransactionId: number },
  ): void {
    this.records.set(record.localTransactionId, {
      ...cloneStart(record),
      startReplayed: true,
      ocppTransactionId: record.ocppTransactionId,
      meterValues: [],
      stop: null,
    });
  }

  get(localTransactionId: string): OfflineTransactionRecord | undefined {
    const record = this.records.get(localTransactionId);
    return record === undefined ? undefined : cloneRecord(record);
  }

  recordMeterValue(
    localTransactionId: string,
    record: {
      meterWh: number;
      sampledAt: Date;
      measurements?: MeterValueElectricalMeasurements;
    },
  ): void {
    const transactionRecord = this.records.get(localTransactionId);
    if (transactionRecord === undefined) {
      return;
    }

    transactionRecord.meterValues.push({
      meterWh: record.meterWh,
      sampledAt: cloneDate(record.sampledAt),
      measurements: cloneMeasurements(record.measurements),
      replayed: false,
    });
  }

  recordStopped(
    localTransactionId: string,
    record: {
      meterStopWh: number;
      stoppedAt: Date;
      reason: TransactionStopReason;
      idTag: string | null;
    },
  ): void {
    const transactionRecord = this.records.get(localTransactionId);
    if (transactionRecord === undefined) {
      return;
    }

    transactionRecord.stop = {
      ...record,
      stoppedAt: cloneDate(record.stoppedAt),
      replayed: false,
    };
  }

  listPending(): OfflineTransactionRecord[] {
    return [...this.records.values()]
      .filter((record) =>
        !record.startReplayed ||
        record.meterValues.some((meterValue) => !meterValue.replayed) ||
        (record.stop !== null && !record.stop.replayed)
      )
      .map(cloneRecord)
      .sort((left, right) =>
        left.startedAt.getTime() - right.startedAt.getTime()
      );
  }

  bindStart(
    localTransactionId: string,
    input: { ocppTransactionId: number },
  ): void {
    const record = this.records.get(localTransactionId);
    if (record === undefined) {
      return;
    }

    this.records.set(localTransactionId, {
      ...record,
      startReplayed: true,
      ocppTransactionId: input.ocppTransactionId,
    });
  }

  markMeterValueReplayed(localTransactionId: string, index: number): void {
    const record = this.records.get(localTransactionId);
    const meterValue = record?.meterValues[index];
    if (record === undefined || meterValue === undefined) {
      return;
    }

    record.meterValues[index] = {
      ...meterValue,
      replayed: true,
    };
  }

  markStopReplayed(localTransactionId: string): void {
    const record = this.records.get(localTransactionId);
    if (record?.stop === null || record?.stop === undefined) {
      return;
    }

    record.stop = {
      ...record.stop,
      replayed: true,
    };
  }
}

function cloneRecord(record: OfflineTransactionRecord): OfflineTransactionRecord {
  return {
    ...cloneStart(record),
    startReplayed: record.startReplayed,
    ocppTransactionId: record.ocppTransactionId,
    meterValues: record.meterValues.map((meterValue) => ({
      ...meterValue,
      sampledAt: cloneDate(meterValue.sampledAt),
      measurements: cloneMeasurements(meterValue.measurements),
    })),
    stop: record.stop === null
      ? null
      : {
          ...record.stop,
          stoppedAt: cloneDate(record.stop.stoppedAt),
        },
  };
}

function cloneMeasurements(
  measurements: MeterValueElectricalMeasurements | undefined,
): MeterValueElectricalMeasurements | undefined {
  return measurements === undefined ? undefined : { ...measurements };
}

function cloneStart(
  record: OfflineTransactionStartRecord,
): OfflineTransactionStartRecord {
  return {
    ...record,
    startedAt: cloneDate(record.startedAt),
  };
}
