import type { CreateEventInput } from "../repositories/event.repository";
import type {
  ChargingPointRuntimeStatus,
  UpsertConnectorSnapshotInput
} from "../repositories/charging-point.repository";
import type {
  ChargingPointRuntimeEvent,
  ChargingPointRuntimeEventBus,
  ChargingPointRuntimeEventType
} from "./charging-point-runtime.adapter";

export interface ProtocolEventProjectionStore {
  updateRuntimeStatus(stationId: string, status: ChargingPointRuntimeStatus): Promise<void>;
  upsertConnectorSnapshot(stationId: string, input: UpsertConnectorSnapshotInput): Promise<void>;
}

export interface ProtocolEventLog {
  append(input: CreateEventInput): Promise<unknown>;
}

const CHARGING_POINT_SIMULATOR_EVENT_TYPES: ChargingPointRuntimeEventType[] = [
  "chargingPointSimulator.status",
  "session.status",
  "chargingPoint.status",
  "evse.status",
  "connector.status",
  "authorization.status",
  "transaction.status",
  "transaction.meterValue",
  "protocol.message"
];

export class ProtocolEventProjection {
  constructor(
    private readonly store: ProtocolEventProjectionStore,
    private readonly eventLog: ProtocolEventLog,
  ) {}

  subscribeToRuntime(stationId: string, events: ChargingPointRuntimeEventBus): Array<() => void> {
    return CHARGING_POINT_SIMULATOR_EVENT_TYPES.map((type) =>
      events.subscribe(type, (event) => {
        void this.apply(stationId, event);
      }),
    );
  }

  async apply(stationId: string, event: ChargingPointRuntimeEvent): Promise<void> {
    if (event.type === "chargingPointSimulator.status") {
      await this.store.updateRuntimeStatus(stationId, event.currentStatus);
    }

    if (event.type === "connector.status") {
      await this.store.upsertConnectorSnapshot(stationId, {
        connectorId: event.resource.connectorId,
        status: event.currentStatus
      });
    }

    await this.eventLog.append({
      stationId,
      type: event.type,
      payload: event,
      protocolMessage: event.type === "protocol.message",
      occurredAt: new Date(event.occurredAt)
    });
  }

  async appendChargingPointEvent(input: {
    stationId: string;
    type: string;
    payload: unknown;
  }): Promise<void> {
    await this.eventLog.append(input);
  }
}
