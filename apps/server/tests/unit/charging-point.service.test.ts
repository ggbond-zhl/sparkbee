import { describe, expect, test } from "vitest";

import type {
  CreateEventInput,
  EventRecord,
} from "../../src/repositories/event.repository";
import type {
  ConnectorSnapshotRecord,
  CreateChargingPointInput,
  ChargingPointRecord,
  ChargingPointRepository,
  ChargingPointRuntimeStatus,
  UpdateChargingPointInput,
  UpsertConnectorSnapshotInput
} from "../../src/repositories/charging-point.repository";
import type {
  CreateTransactionInput,
  EndTransactionInput,
  TransactionRepository
} from "../../src/repositories/transaction.repository";
import { ProtocolEventProjection } from "../../src/services/protocol-event-projection";
import { ChargingPointService } from "../../src/services/charging-point.service";
import type { ChargingPointRuntime } from "../../src/services/charging-point-runtime.adapter";
import type { ChargingPointSimulatorEventBus } from "@spark-bee/simulator-core";

class FakeChargingPointRepository implements ChargingPointRepository {
  readonly stations = new Map<string, ChargingPointRecord>();

  constructor(seed: ChargingPointRecord[]) {
    for (const station of seed) {
      this.stations.set(station.id, station);
    }
  }

  async create(input: CreateChargingPointInput): Promise<ChargingPointRecord> {
    const station = createChargingPoint({ ...input, id: crypto.randomUUID() });
    this.stations.set(station.id, station);
    return station;
  }

  async delete(id: string): Promise<void> {
    this.stations.delete(id);
  }

  async findById(id: string): Promise<ChargingPointRecord | null> {
    return this.stations.get(id) ?? null;
  }

  async list(): Promise<ChargingPointRecord[]> {
    return [...this.stations.values()];
  }

  async listByDesiredStatus(status: "running" | "stopped"): Promise<ChargingPointRecord[]> {
    return [...this.stations.values()].filter((station) => station.desiredStatus === status);
  }

  async listConnectorSnapshots(): Promise<ConnectorSnapshotRecord[]> {
    return [];
  }

  async update(id: string, input: UpdateChargingPointInput): Promise<ChargingPointRecord> {
    const current = this.stations.get(id)!;
    const next = { ...current, ...input, updatedAt: new Date() };
    this.stations.set(id, next);
    return next;
  }

  async updateDesiredStatus(id: string, status: "running" | "stopped"): Promise<void> {
    const station = this.stations.get(id)!;
    this.stations.set(id, { ...station, desiredStatus: status });
  }

  async updateRuntimeStatus(id: string, status: ChargingPointRuntimeStatus): Promise<void> {
    const station = this.stations.get(id)!;
    this.stations.set(id, { ...station, runtimeStatus: status });
  }

  async upsertConnectorSnapshot(_stationId: string, _input: UpsertConnectorSnapshotInput): Promise<void> {}
}

class FakeTransactionRepository implements TransactionRepository {
  readonly created: CreateTransactionInput[] = [];
  readonly ended: EndTransactionInput[] = [];

  async create(input: CreateTransactionInput): Promise<void> {
    this.created.push(input);
  }

  async markEnded(input: EndTransactionInput): Promise<void> {
    this.ended.push(input);
  }
}

class FakeEventLog {
  async append(input: CreateEventInput): Promise<EventRecord> {
    return {
      id: "event-1",
      stationId: input.stationId ?? null,
      type: input.type,
      payload: input.payload,
      protocolMessage: input.protocolMessage ?? false,
      occurredAt: input.occurredAt ?? new Date("2026-01-01T00:00:00.000Z")
    };
  }
}

class FakeChargingPointRuntime implements ChargingPointRuntime {
  readonly id = "CP-001";
  readonly protocol = "OCPP16J";
  readonly events: ChargingPointSimulatorEventBus = {
    subscribe: () => () => {}
  };

  async start() {
    return {
      chargingPointId: this.id,
      chargingPointSimulatorStatus: "running" as const,
      bootStatus: "Accepted" as const
    };
  }

  async stop() {
    return {
      chargingPointId: this.id,
      chargingPointSimulatorStatus: "stopped" as const
    };
  }

  async dispose(): Promise<void> {}

  async plug() {
    return {
      chargingPointId: this.id,
      connectorId: 1,
      plugState: "plugged" as const,
      vehiclePresence: "detected" as const,
      connectorStatus: "occupied"
    };
  }

  async unplug() {
    return {
      chargingPointId: this.id,
      connectorId: 1,
      plugState: "unplugged" as const,
      vehiclePresence: "absent" as const,
      connectorStatus: "available"
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
      sampledAt: new Date("2026-01-01T00:00:30.000Z")
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
}

describe("ChargingPointService", () => {
  test("records accepted transaction lifecycle", async () => {
    const station = createChargingPoint();
    const stations = new FakeChargingPointRepository([station]);
    const transactions = new FakeTransactionRepository();
    const runtime = new FakeChargingPointRuntime();
    const service = new ChargingPointService(
      stations,
      transactions,
      new ProtocolEventProjection(stations, new FakeEventLog()),
      () => runtime,
    );

    await service.startChargingPoint(station.id);
    const startResult = await service.startTransaction(station.id, {
      connectorId: 1,
      idTag: "TAG-1",
      meterStartWh: 1000
    });
    const stopResult = await service.stopTransaction(station.id, {
      transactionId: "tx-1",
      reason: "local",
      meterStopWh: 1300
    });

    expect(startResult).toEqual({ status: "accepted", transactionId: "tx-1" });
    expect(stopResult).toMatchObject({ status: "accepted", transactionId: "tx-1" });
    expect(transactions.created).toEqual([
      {
        stationId: station.id,
        simulatorTransactionId: "tx-1",
        connectorId: 1,
        idTag: "TAG-1",
        meterStartWh: 1000
      }
    ]);
    expect(transactions.ended).toEqual([
      {
        simulatorTransactionId: "tx-1",
        meterStopWh: 1300,
        stoppedAt: new Date("2026-01-01T00:01:00.000Z")
      }
    ]);
  });
});

function createChargingPoint(overrides: Partial<ChargingPointRecord & CreateChargingPointInput> = {}): ChargingPointRecord {
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
