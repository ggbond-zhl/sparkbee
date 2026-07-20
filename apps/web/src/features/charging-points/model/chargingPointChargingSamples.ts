import type { ActiveTransactionSamplesResponse } from "@spark-bee/contracts";

import type {
  RuntimeEventLogEntry,
  TransactionMeterValueEvent,
  TransactionRuntimeSnapshot,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";

export interface ChargingSamplePoint {
  id: string;
  evseId: number;
  connectorId: number;
  transactionId: string;
  sampledAt: string;
  meterWh: number;
  powerW: number;
  currentA: number;
  voltageV: number;
}

export function buildChargingSampleSeriesByConnector(
  events: RuntimeEventLogEntry[],
): Map<string, ChargingSamplePoint[]> {
  const samplesByConnector = new Map<string, ChargingSamplePoint[]>();

  for (const event of events) {
    if (event.eventType !== "transaction.meterValue") {
      continue;
    }

    const detail = event.detail;
    if (!isTransactionMeterValueEvent(detail)) {
      continue;
    }

    const key = chargingSampleConnectorKey(
      detail.resource.evseId,
      detail.resource.connectorId,
    );
    const samples = samplesByConnector.get(key) ?? [];
    samples.push({
      id: event.id,
      evseId: detail.resource.evseId,
      connectorId: detail.resource.connectorId,
      transactionId: detail.resource.transactionId,
      sampledAt: detail.sampledAt,
      meterWh: detail.meterWh,
      powerW: detail.powerW,
      currentA: detail.currentA,
      voltageV: detail.voltageV,
    });
    samplesByConnector.set(key, samples);
  }

  for (const samples of samplesByConnector.values()) {
    samples.sort((left, right) => Date.parse(left.sampledAt) - Date.parse(right.sampledAt));
  }

  return samplesByConnector;
}

export function buildActiveChargingSampleSeriesByConnector(input: {
  persisted: ActiveTransactionSamplesResponse;
  events: RuntimeEventLogEntry[];
  transactionStatuses: Record<string, TransactionRuntimeSnapshot>;
}): Map<string, ChargingSamplePoint[]> {
  const activeTransactionByConnector = new Map<string, string>();
  const persistedSamplesByConnector = new Map<string, ChargingSamplePoint[]>();

  for (const item of input.persisted.items) {
    const key = chargingSampleConnectorKey(item.evseId, item.connectorId);
    activeTransactionByConnector.set(key, item.transactionId);
    persistedSamplesByConnector.set(
      key,
      item.samples.map((sample) => ({
        ...sample,
        evseId: item.evseId,
        connectorId: item.connectorId,
        transactionId: item.transactionId,
      })),
    );
  }

  for (const status of Object.values(input.transactionStatuses)) {
    const key = chargingSampleConnectorKey(status.evseId, status.connectorId);
    if (status.currentStatus === "active") {
      activeTransactionByConnector.set(key, status.transactionId);
      continue;
    }

    if (activeTransactionByConnector.get(key) === status.transactionId) {
      activeTransactionByConnector.delete(key);
    }
  }

  const eventSamplesByConnector = buildChargingSampleSeriesByConnector(input.events);
  const result = new Map<string, ChargingSamplePoint[]>();
  for (const [key, transactionId] of activeTransactionByConnector) {
    const samplesById = new Map<string, ChargingSamplePoint>();
    for (const sample of persistedSamplesByConnector.get(key) ?? []) {
      if (sample.transactionId === transactionId) {
        samplesById.set(sample.id, sample);
      }
    }
    for (const sample of eventSamplesByConnector.get(key) ?? []) {
      if (sample.transactionId === transactionId) {
        samplesById.set(sample.id, sample);
      }
    }
    result.set(
      key,
      [...samplesById.values()].sort(
        (left, right) => Date.parse(left.sampledAt) - Date.parse(right.sampledAt),
      ),
    );
  }

  return result;
}

export function chargingSampleConnectorKey(evseId: number, connectorId: number) {
  return `${evseId}/${connectorId}`;
}

function isTransactionMeterValueEvent(
  value: unknown,
): value is TransactionMeterValueEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<TransactionMeterValueEvent>;
  return (
    candidate.type === "transaction.meterValue" &&
    typeof candidate.sampledAt === "string" &&
    typeof candidate.meterWh === "number" &&
    typeof candidate.powerW === "number" &&
    typeof candidate.currentA === "number" &&
    typeof candidate.voltageV === "number" &&
    typeof candidate.resource === "object" &&
    candidate.resource !== null &&
    candidate.resource.scope === "transaction" &&
    typeof candidate.resource.evseId === "number" &&
    typeof candidate.resource.connectorId === "number" &&
    typeof candidate.resource.transactionId === "string"
  );
}
