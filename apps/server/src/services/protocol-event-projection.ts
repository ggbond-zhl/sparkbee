import type { CreateEventInput } from "../repositories/event.repository";
import type {
  StationRuntimeStatus,
  UpsertConnectorSnapshotInput
} from "../repositories/station.repository";
import type {
  StationRuntimeEvent,
  StationRuntimeEventBus,
  StationRuntimeEventType
} from "./station-runtime.adapter";

export interface ProtocolEventProjectionStore {
  updateRuntimeStatus(stationId: string, status: StationRuntimeStatus): Promise<void>;
  upsertConnectorSnapshot(stationId: string, input: UpsertConnectorSnapshotInput): Promise<void>;
}

export interface ProtocolEventLog {
  append(input: CreateEventInput): Promise<unknown>;
}

const SIMULATOR_EVENT_TYPES: StationRuntimeEventType[] = [
  "simulator.status",
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

  subscribeToRuntime(stationId: string, events: StationRuntimeEventBus): Array<() => void> {
    return SIMULATOR_EVENT_TYPES.map((type) =>
      events.subscribe(type, (event) => {
        void this.apply(stationId, event);
      }),
    );
  }

  async apply(stationId: string, event: StationRuntimeEvent): Promise<void> {
    if (event.type === "simulator.status") {
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

  async appendStationEvent(input: {
    stationId: string;
    type: string;
    payload: unknown;
  }): Promise<void> {
    await this.eventLog.append(input);
  }
}
