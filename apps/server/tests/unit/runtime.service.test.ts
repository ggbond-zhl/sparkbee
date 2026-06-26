import { describe, expect, test } from "vitest";

import type { CreateEventInput, EventRecord, EventRepository } from "../../src/repositories/event.repository";
import type {
  CreateTransactionInput,
  EndTransactionInput,
  TransactionRepository
} from "../../src/repositories/transaction.repository";
import type {
  ConnectorSnapshotRecord,
  CreateStationInput,
  StationRecord,
  StationRepository,
  StationRuntimeStatus,
  UpdateStationInput,
  UpsertConnectorSnapshotInput
} from "../../src/repositories/station.repository";
import { ProtocolEventLedger } from "../../src/services/protocol-event-ledger";
import { ProtocolEventProjection } from "../../src/services/protocol-event-projection";
import { StationService } from "../../src/services/station.service";
import type {
  StationRuntime,
  StationRuntimeFactory,
} from "../../src/services/station-runtime.adapter";
import type {
  Simulator,
  SimulatorEventMap,
  SimulatorEventType,
  SimulatorStartResult,
  SimulatorStopResult
} from "@spark-bee/simulator-core";

class FakeStationRepository implements StationRepository {
  readonly connectors: UpsertConnectorSnapshotInput[] = [];
  readonly stations = new Map<string, StationRecord>();

  constructor(seed: StationRecord[]) {
    for (const station of seed) {
      this.stations.set(station.id, station);
    }
  }

  async create(input: CreateStationInput): Promise<StationRecord> {
    const station = createStation({ ...input, id: crypto.randomUUID() });
    this.stations.set(station.id, station);
    return station;
  }

  async delete(id: string): Promise<void> {
    this.stations.delete(id);
  }

  async findById(id: string): Promise<StationRecord | null> {
    return this.stations.get(id) ?? null;
  }

  async list(): Promise<StationRecord[]> {
    return [...this.stations.values()];
  }

  async listByDesiredStatus(status: "running" | "stopped"): Promise<StationRecord[]> {
    return [...this.stations.values()].filter((station) => station.desiredStatus === status);
  }

  async listConnectorSnapshots(): Promise<ConnectorSnapshotRecord[]> {
    return [];
  }

  async update(id: string, input: UpdateStationInput): Promise<StationRecord> {
    const current = this.stations.get(id)!;
    const next = { ...current, ...input, updatedAt: new Date() };
    this.stations.set(id, next);
    return next;
  }

  async updateDesiredStatus(id: string, status: "running" | "stopped"): Promise<void> {
    const station = this.stations.get(id)!;
    this.stations.set(id, { ...station, desiredStatus: status });
  }

  async updateRuntimeStatus(id: string, status: StationRuntimeStatus): Promise<void> {
    const station = this.stations.get(id)!;
    this.stations.set(id, { ...station, runtimeStatus: status });
  }

  async upsertConnectorSnapshot(_stationId: string, input: UpsertConnectorSnapshotInput): Promise<void> {
    this.connectors.push(input);
  }
}

class FakeEventRepository implements EventRepository {
  readonly records: EventRecord[] = [];

  async append(input: CreateEventInput): Promise<EventRecord> {
    const event: EventRecord = {
      id: crypto.randomUUID(),
      stationId: input.stationId ?? null,
      type: input.type,
      payload: input.payload,
      protocolMessage: input.protocolMessage ?? false,
      occurredAt: input.occurredAt ?? new Date()
    };
    this.records.push(event);
    return event;
  }

  async listByStation(stationId: string): Promise<EventRecord[]> {
    return this.records.filter((record) => record.stationId === stationId);
  }

  async trimStationEvents(): Promise<void> {}
}

class FakeTransactionRepository implements TransactionRepository {
  async create(_input: CreateTransactionInput): Promise<void> {}

  async markEnded(_input: EndTransactionInput): Promise<void> {}
}

class FakeSimulator implements Simulator {
  readonly id = "CP-001";
  readonly protocol = "OCPP16J";
  private readonly listeners = new Map<SimulatorEventType, Set<(event: never) => void>>();

  readonly events = {
    subscribe: <TType extends SimulatorEventType>(
      type: TType,
      listener: (event: SimulatorEventMap[TType]) => void,
    ) => {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener as (event: never) => void);
      this.listeners.set(type, listeners);
      return () => listeners.delete(listener as (event: never) => void);
    }
  };

  async start(): Promise<SimulatorStartResult> {
    this.emit("simulator.status", {
      id: "event-1",
      sequence: 1,
      type: "simulator.status",
      simulatorId: this.id,
      protocol: "OCPP16J",
      resource: { scope: "simulator" },
      occurredAt: new Date().toISOString(),
      previousStatus: "starting",
      currentStatus: "running"
    });
    return {
      chargingPointId: this.id,
      simulatorStatus: "running",
      bootStatus: "Accepted"
    };
  }

  async stop(): Promise<SimulatorStopResult> {
    return {
      chargingPointId: this.id,
      simulatorStatus: "stopped"
    };
  }

  async dispose(): Promise<void> {}

  async plug() {
    return {
      chargingPointId: this.id,
      evseId: 1,
      connectorId: 1,
      plugState: "plugged" as const,
      vehiclePresence: "detected" as const,
      connectorStatus: "occupied" as const
    };
  }

  async unplug() {
    return {
      chargingPointId: this.id,
      evseId: 1,
      connectorId: 1,
      plugState: "unplugged" as const,
      vehiclePresence: "absent" as const,
      connectorStatus: "available" as const
    };
  }

  async authorize() {
    return { status: "accepted" as const };
  }

  async startTransaction() {
    return { status: "accepted" as const, transactionId: "tx-1" };
  }

  async reportMeterValue() {
    return {
      status: "accepted" as const,
      transactionId: "tx-1",
      meterWh: 1200,
      sampledAt: new Date("2026-01-01T00:00:00.000Z")
    };
  }

  async stopTransaction() {
    return {
      status: "accepted" as const,
      transactionId: "tx-1",
      meterStopWh: 1300,
      stoppedAt: new Date("2026-01-01T00:01:00.000Z")
    };
  }

  emit<TType extends SimulatorEventType>(type: TType, event: SimulatorEventMap[TType]) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as never);
    }
  }
}

class FakeStationRuntime implements StationRuntime {
  readonly id = "CP-001";
  readonly protocol = "OCPP16J";
  readonly pluggedConnectorIds: number[] = [];
  private readonly listeners = new Map<SimulatorEventType, Set<(event: never) => void>>();

  readonly events = {
    subscribe: <TType extends SimulatorEventType>(
      type: TType,
      listener: (event: SimulatorEventMap[TType]) => void,
    ) => {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener as (event: never) => void);
      this.listeners.set(type, listeners);
      return () => listeners.delete(listener as (event: never) => void);
    }
  };

  async start(): Promise<SimulatorStartResult> {
    this.emit("simulator.status", {
      id: "event-1",
      sequence: 1,
      type: "simulator.status",
      simulatorId: this.id,
      protocol: "OCPP16J",
      resource: { scope: "simulator" },
      occurredAt: new Date().toISOString(),
      previousStatus: "starting",
      currentStatus: "running"
    });
    return {
      chargingPointId: this.id,
      simulatorStatus: "running",
      bootStatus: "Accepted"
    };
  }

  async stop(): Promise<SimulatorStopResult> {
    return {
      chargingPointId: this.id,
      simulatorStatus: "stopped"
    };
  }

  async dispose(): Promise<void> {}

  async plug(connectorId: number) {
    this.pluggedConnectorIds.push(connectorId);
    return {
      chargingPointId: this.id,
      connectorId,
      plugState: "plugged" as const,
      vehiclePresence: "detected" as const,
      connectorStatus: "occupied" as const
    };
  }

  async unplug(connectorId: number) {
    return {
      chargingPointId: this.id,
      connectorId,
      plugState: "unplugged" as const,
      vehiclePresence: "absent" as const,
      connectorStatus: "available" as const
    };
  }

  async authorize() {
    return { status: "accepted" as const };
  }

  async startTransaction() {
    return { status: "accepted" as const, transactionId: "tx-1" };
  }

  async reportMeterValue() {
    return {
      status: "accepted" as const,
      transactionId: "tx-1",
      meterWh: 1200,
      sampledAt: new Date("2026-01-01T00:00:00.000Z")
    };
  }

  async stopTransaction() {
    return {
      status: "accepted" as const,
      transactionId: "tx-1",
      meterStopWh: 1300,
      stoppedAt: new Date("2026-01-01T00:01:00.000Z")
    };
  }

  emit<TType extends SimulatorEventType>(type: TType, event: SimulatorEventMap[TType]) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as never);
    }
  }
}

describe("StationService runtime workflow", () => {
  test("restores stations with running intent and persists simulator events", async () => {
    const station = createStation({ desiredStatus: "running" });
    const stationRepository = new FakeStationRepository([station]);
    const eventRepository = new FakeEventRepository();
    const eventService = new ProtocolEventLedger(eventRepository, { eventLogRetentionPerStation: 10 });
    const eventProjection = new ProtocolEventProjection(stationRepository, eventService);
    const service = new StationService(
      stationRepository,
      new FakeTransactionRepository(),
      eventProjection,
      () => new FakeSimulator(),
    );

    await service.restoreRunningStations();
    await Promise.resolve();

    expect(stationRepository.stations.get(station.id)?.runtimeStatus).toBe("running");
    expect(eventRepository.records.map((record) => record.type)).toContain("simulator.status");
  });

  test("executes connector commands through the station runtime adapter interface", async () => {
    const station = createStation({ desiredStatus: "stopped" });
    const stationRepository = new FakeStationRepository([station]);
    const eventRepository = new FakeEventRepository();
    const eventService = new ProtocolEventLedger(eventRepository, { eventLogRetentionPerStation: 10 });
    const eventProjection = new ProtocolEventProjection(stationRepository, eventService);
    const stationRuntime = new FakeStationRuntime();
    const runtimeFactory: StationRuntimeFactory = () => stationRuntime;
    const service = new StationService(
      stationRepository,
      new FakeTransactionRepository(),
      eventProjection,
      runtimeFactory,
    );

    await service.startStation(station.id);
    await service.plug(station.id, 2);
    stationRuntime.emit("connector.status", {
      id: "event-2",
      sequence: 2,
      type: "connector.status",
      simulatorId: station.identity,
      protocol: "OCPP16J",
      resource: { scope: "connector", evseId: 9, connectorId: 2 },
      occurredAt: "2026-01-01T00:00:00.000Z",
      previousStatus: "available",
      currentStatus: "occupied"
    });
    await Promise.resolve();

    expect(stationRuntime.pluggedConnectorIds).toEqual([2]);
    expect(stationRepository.connectors).toEqual([
      {
        connectorId: 2,
        status: "occupied"
      }
    ]);
    const connectorEvent = eventRepository.records.find((record) =>
      record.type === "connector.status"
    );
    expect(connectorEvent).toMatchObject({
      stationId: station.id,
      type: "connector.status",
      protocolMessage: false
    });
  });

});

function createStation(overrides: Partial<StationRecord & CreateStationInput> = {}): StationRecord {
  return {
    id: overrides.id ?? "11111111-1111-4111-8111-111111111111",
    name: overrides.name ?? "测试桩",
    protocol: "OCPP16J",
    csmsBaseUrl: overrides.csmsBaseUrl ?? "ws://localhost:9000/ocpp",
    identity: overrides.identity ?? "CP-001",
    vendor: overrides.vendor ?? "SparkBee",
    model: overrides.model ?? "BeeBox",
    connectorCount: overrides.connectorCount ?? 2,
    connectorMaxPowerW: overrides.connectorMaxPowerW ?? 7000,
    desiredStatus: overrides.desiredStatus ?? "stopped",
    runtimeStatus: overrides.runtimeStatus ?? "stopped",
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00.000Z")
  };
}
