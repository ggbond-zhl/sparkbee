import type {
  CreateStationInput,
  StationRecord,
  StationRepository,
  UpdateStationInput
} from "../repositories/station.repository";
import type { TransactionRepository } from "../repositories/transaction.repository";
import { badRequest, notFound } from "../utils/errors";
import type { ProtocolEventProjection } from "./protocol-event-projection";
import {
  createStationRuntime,
  type StationRuntime,
  type StationRuntimeFactory
} from "./station-runtime.adapter";
import { StationRuntimeRegistry } from "./station-runtime-registry";

export class StationService {
  private readonly registry: StationRuntimeRegistry;

  constructor(
    private readonly stations: StationRepository,
    private readonly transactions: TransactionRepository,
    eventProjection: ProtocolEventProjection,
    runtimeFactory: StationRuntimeFactory = createStationRuntime,
  ) {
    this.registry = new StationRuntimeRegistry(
      eventProjection,
      runtimeFactory,
    );
  }

  listStations() {
    return this.stations.list();
  }

  async getStation(id: string) {
    const station = await this.stations.findById(id);
    if (station === null) {
      throw notFound(`桩实例 ${id} 不存在`);
    }

    const connectors = await this.stations.listConnectorSnapshots(id);
    return { station, connectors };
  }

  createStation(input: CreateStationInput) {
    return this.stations.create(input);
  }

  updateStation(id: string, input: UpdateStationInput) {
    return this.stations.update(id, input);
  }

  async deleteStation(id: string) {
    await this.registry.dispose(id);
    await this.stations.delete(id);
  }

  async restoreRunningStations(): Promise<void> {
    const stations = await this.stations.listByDesiredStatus("running");
    await Promise.allSettled(stations.map((station) => this.startStation(station.id)));
  }

  async startStation(id: string): Promise<StationRecord> {
    const station = await this.requireStation(id);

    if (this.registry.has(id)) {
      return station;
    }

    await this.stations.updateDesiredStatus(id, "running");
    await this.stations.updateRuntimeStatus(id, "starting");

    try {
      await this.registry.start(station);
      return (await this.stations.findById(id)) ?? station;
    } catch (cause) {
      await this.stations.updateRuntimeStatus(id, "stopped");
      await this.registry.dispose(id);
      throw cause;
    }
  }

  async stopStation(id: string): Promise<void> {
    await this.requireStation(id);
    await this.stations.updateDesiredStatus(id, "stopped");
    await this.registry.stop(id);
    await this.stations.updateRuntimeStatus(id, "stopped");
  }

  plug(id: string, connectorId: number) {
    return this.requireRuntime(id).plug(connectorId);
  }

  unplug(id: string, connectorId: number) {
    return this.requireRuntime(id).unplug(connectorId);
  }

  authorize(id: string, input: { connectorId: number; idTag: string }) {
    return this.requireRuntime(id).authorize(input);
  }

  async startTransaction(
    id: string,
    input: { connectorId: number; idTag: string; meterStartWh?: number },
  ) {
    const result = await this.requireRuntime(id).startTransaction({
      connectorId: input.connectorId,
      idTag: input.idTag,
      meterStartWh: input.meterStartWh
    });

    if (result.status === "accepted") {
      await this.transactions.create({
        stationId: id,
        simulatorTransactionId: result.transactionId,
        connectorId: input.connectorId,
        idTag: input.idTag,
        meterStartWh: input.meterStartWh ?? 0
      });
    }

    return result;
  }

  reportMeterValue(
    id: string,
    input: { transactionId: string; meterWh: number; sampledAt?: Date },
  ) {
    return this.requireRuntime(id).reportMeterValue(input);
  }

  async stopTransaction(
    id: string,
    input: {
      transactionId: string;
      reason: "local" | "remote" | "unlock-command" | "ev-disconnected" | "deauthorized" | "emergency-stop" | "other";
      meterStopWh?: number;
    },
  ) {
    const result = await this.requireRuntime(id).stopTransaction(input);

    if (result.status === "accepted") {
      await this.transactions.markEnded({
        simulatorTransactionId: result.transactionId,
        meterStopWh: result.meterStopWh,
        stoppedAt: result.stoppedAt
      });
    }

    return result;
  }

  private requireRuntime(stationId: string): StationRuntime {
    const runtime = this.registry.get(stationId);
    if (runtime === undefined) {
      throw badRequest("桩实例未运行");
    }

    return runtime;
  }

  private async requireStation(stationId: string): Promise<StationRecord> {
    const station = await this.stations.findById(stationId);
    if (station === null) {
      throw notFound(`桩实例 ${stationId} 不存在`);
    }

    return station;
  }
}
