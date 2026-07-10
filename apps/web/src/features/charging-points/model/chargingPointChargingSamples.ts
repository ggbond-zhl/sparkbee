import type {
  RuntimeEventLogEntry,
  TransactionMeterValueEvent,
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
