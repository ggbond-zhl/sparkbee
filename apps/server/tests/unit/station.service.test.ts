import { describe, expect, test } from "vitest";

import type {
  ConnectorSnapshotRecord,
  CreateStationInput,
  StationRecord,
  StationRepository,
  StationRuntimeStatus,
  UpdateStationInput,
  UpsertConnectorSnapshotInput
} from "../../src/repositories/station.repository";
import type {
  CreateTransactionInput,
  EndTransactionInput,
  TransactionRepository
} from "../../src/repositories/transaction.repository";
import { StationService } from "../../src/services/station.service";

class FakeStationRepository implements StationRepository {
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

class FakeRuntime {
  async restoreRunningStations(): Promise<void> {}

  async disposeStation(): Promise<void> {}

  async startStation() {
    return createStation({ desiredStatus: "running", runtimeStatus: "running" });
  }

  async stopStation(): Promise<void> {}

  async plug() {
    return {};
  }

  async unplug() {
    return {};
  }

  async authorize() {
    return { status: "accepted" as const };
  }

  async startTransaction() {
    return { status: "accepted" as const, transactionId: "tx-1" };
  }

  async reportMeterValue() {
    return { status: "accepted" as const, transactionId: "tx-1" };
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

describe("StationService", () => {
  test("records accepted transaction lifecycle", async () => {
    const station = createStation();
    const stations = new FakeStationRepository([station]);
    const transactions = new FakeTransactionRepository();
    const runtime = new FakeRuntime();
    const service = new StationService(
      stations,
      runtime as never,
      transactions,
    );

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
