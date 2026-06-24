import type { StationRecord, StationRepository } from "../repositories/station.repository";
import { badRequest, notFound } from "../utils/errors";
import type { ProtocolEventProjection } from "./protocol-event-projection";
import {
  createStationRuntime,
  type StationRuntime,
  type StationRuntimeFactory
} from "./station-runtime.adapter";
import { StationRuntimeRegistry } from "./station-runtime-registry";

export class RuntimeService {
  private readonly registry: StationRuntimeRegistry;

  constructor(
    private readonly stations: StationRepository,
    private readonly eventProjection: ProtocolEventProjection,
    private readonly runtimeFactory: StationRuntimeFactory = createStationRuntime,
  ) {
    this.registry = new StationRuntimeRegistry(
      this.eventProjection,
      this.runtimeFactory,
    );
  }

  async restoreRunningStations(): Promise<void> {
    const stations = await this.stations.listByDesiredStatus("running");
    await Promise.allSettled(stations.map((station) => this.startStation(station.id)));
  }

  async startStation(stationId: string): Promise<StationRecord> {
    const station = await this.requireStation(stationId);

    if (this.registry.has(stationId)) {
      return station;
    }

    await this.stations.updateDesiredStatus(stationId, "running");
    await this.stations.updateRuntimeStatus(stationId, "starting");

    try {
      await this.registry.start(station);
      return (await this.stations.findById(stationId)) ?? station;
    } catch (cause) {
      await this.stations.updateRuntimeStatus(stationId, "stopped");
      await this.eventProjection.appendStationEvent({
        stationId,
        type: "station.start_failed",
        payload: { message: cause instanceof Error ? cause.message : String(cause) }
      });
      throw cause;
    }
  }

  async stopStation(stationId: string): Promise<void> {
    await this.requireStation(stationId);
    await this.stations.updateDesiredStatus(stationId, "stopped");
    await this.registry.stop(stationId);
    await this.stations.updateRuntimeStatus(stationId, "stopped");
  }

  async disposeStation(stationId: string): Promise<void> {
    await this.registry.dispose(stationId);
  }

  async plug(stationId: string, connectorId: number) {
    return this.requireRuntime(stationId).plug(connectorId);
  }

  async unplug(stationId: string, connectorId: number) {
    return this.requireRuntime(stationId).unplug(connectorId);
  }

  async authorize(stationId: string, input: { connectorId: number; idTag: string }) {
    return this.requireRuntime(stationId).authorize(input);
  }

  async startTransaction(
    stationId: string,
    input: { connectorId: number; idTag: string; meterStartWh?: number },
  ) {
    return this.requireRuntime(stationId).startTransaction({
      connectorId: input.connectorId,
      idTag: input.idTag,
      meterStartWh: input.meterStartWh
    });
  }

  async reportMeterValue(
    stationId: string,
    input: { transactionId: string; meterWh: number; sampledAt?: Date },
  ) {
    return this.requireRuntime(stationId).reportMeterValue(input);
  }

  async stopTransaction(
    stationId: string,
    input: {
      transactionId: string;
      reason: "local" | "remote" | "unlock-command" | "ev-disconnected" | "deauthorized" | "emergency-stop" | "other";
      meterStopWh?: number;
    },
  ) {
    return this.requireRuntime(stationId).stopTransaction(input);
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
