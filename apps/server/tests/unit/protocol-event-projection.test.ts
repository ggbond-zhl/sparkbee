import { describe, expect, test } from "vitest";

import type {
  ChargingPointSimulatorEventBus,
  ChargingPointSimulatorEventMap,
  ChargingPointSimulatorEventType
} from "@spark-bee/simulator-core";
import type { CreateEventInput } from "../../src/repositories/event.repository";
import type { ChargingPointRuntimeStatus, UpsertConnectorSnapshotInput } from "../../src/repositories/charging-point.repository";
import { ProtocolEventProjection } from "../../src/services/protocol-event-projection";

class FakeProjectionStore {
  readonly runtimeStatuses: Array<{ stationId: string; status: ChargingPointRuntimeStatus }> = [];
  readonly connectorSnapshots: Array<{ stationId: string; input: UpsertConnectorSnapshotInput }> = [];

  async updateRuntimeStatus(stationId: string, status: ChargingPointRuntimeStatus): Promise<void> {
    this.runtimeStatuses.push({ stationId, status });
  }

  async upsertConnectorSnapshot(
    stationId: string,
    input: UpsertConnectorSnapshotInput,
  ): Promise<void> {
    this.connectorSnapshots.push({ stationId, input });
  }
}

class FakeEventLog {
  readonly events: CreateEventInput[] = [];

  async append(input: CreateEventInput) {
    this.events.push(input);
    return {
      id: "event-log-1",
      stationId: input.stationId ?? null,
      type: input.type,
      payload: input.payload,
      protocolMessage: input.protocolMessage ?? false,
      occurredAt: input.occurredAt ?? new Date()
    };
  }
}

class FakeEventBus implements ChargingPointSimulatorEventBus {
  readonly subscriptions: Array<{ type: ChargingPointSimulatorEventType; unsubscribed: boolean }> = [];

  subscribe<TType extends ChargingPointSimulatorEventType>(
    type: TType,
    _listener: (event: ChargingPointSimulatorEventMap[TType]) => void,
  ): () => void {
    const subscription = { type, unsubscribed: false };
    this.subscriptions.push(subscription);
    return () => {
      subscription.unsubscribed = true;
    };
  }
}

describe("ProtocolEventProjection", () => {
  test("owns runtime event subscription choices", () => {
    const store = new FakeProjectionStore();
    const eventLog = new FakeEventLog();
    const events = new FakeEventBus();
    const projection = new ProtocolEventProjection(store, eventLog);

    const unsubscribe = projection.subscribeToRuntime("station-1", events);
    for (const dispose of unsubscribe) {
      dispose();
    }

    expect(events.subscriptions.map((subscription) => subscription.type)).toEqual([
      "chargingPointSimulator.status",
      "session.status",
      "chargingPoint.status",
      "evse.status",
      "connector.status",
      "authorization.status",
      "transaction.status",
      "transaction.meterValue",
      "protocol.message",
    ]);
    expect(events.subscriptions.every((subscription) => subscription.unsubscribed)).toBe(true);
  });

  test("projects simulator events into station state and event logs", async () => {
    const store = new FakeProjectionStore();
    const eventLog = new FakeEventLog();
    const projection = new ProtocolEventProjection(store, eventLog);

    await projection.apply("station-1", {
      id: "event-1",
      sequence: 1,
      type: "chargingPointSimulator.status",
      chargingPointSimulatorId: "CP-001",
      protocol: "OCPP16J",
      resource: { scope: "chargingPointSimulator" },
      occurredAt: "2026-01-01T00:00:00.000Z",
      previousStatus: "starting",
      currentStatus: "running"
    });
    await projection.apply("station-1", {
      id: "event-2",
      sequence: 2,
      type: "connector.status",
      chargingPointSimulatorId: "CP-001",
      protocol: "OCPP16J",
      resource: { scope: "connector", evseId: 9, connectorId: 2 },
      occurredAt: "2026-01-01T00:00:01.000Z",
      previousStatus: "available",
      currentStatus: "occupied"
    });
    await projection.apply("station-1", {
      id: "event-3",
      sequence: 3,
      type: "protocol.message",
      chargingPointSimulatorId: "CP-001",
      protocol: "OCPP16J",
      resource: { scope: "protocol" },
      occurredAt: "2026-01-01T00:00:02.000Z",
      direction: "sent",
      action: "Heartbeat",
      messageId: "message-1",
      body: {}
    });

    expect(store.runtimeStatuses).toEqual([
      { stationId: "station-1", status: "running" }
    ]);
    expect(store.connectorSnapshots).toEqual([
      {
        stationId: "station-1",
        input: {
          connectorId: 2,
          status: "occupied"
        }
      }
    ]);
    expect(eventLog.events.map((event) => ({
      type: event.type,
      protocolMessage: event.protocolMessage,
      occurredAt: event.occurredAt?.toISOString()
    }))).toEqual([
      {
        type: "chargingPointSimulator.status",
        protocolMessage: false,
        occurredAt: "2026-01-01T00:00:00.000Z"
      },
      {
        type: "connector.status",
        protocolMessage: false,
        occurredAt: "2026-01-01T00:00:01.000Z"
      },
      {
        type: "protocol.message",
        protocolMessage: true,
        occurredAt: "2026-01-01T00:00:02.000Z"
      }
    ]);
  });
});
