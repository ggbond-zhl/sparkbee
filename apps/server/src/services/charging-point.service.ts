import type {
  CreateChargingPointInput,
  ChargingPointRecord,
  ChargingPointRepository,
  UpdateChargingPointInput
} from "../repositories/charging-point.repository";
import type { TransactionRepository } from "../repositories/transaction.repository";
import { badRequest, notFound } from "../utils/errors";
import type { ProtocolEventProjection } from "./protocol-event-projection";
import {
  createChargingPointRuntime,
  type ChargingPointRuntime,
  type ChargingPointRuntimeFactory
} from "./charging-point-runtime.adapter";
import { ChargingPointRuntimeRegistry } from "./charging-point-runtime-registry";

export class ChargingPointService {
  private readonly registry: ChargingPointRuntimeRegistry;

  constructor(
    private readonly stations: ChargingPointRepository,
    private readonly transactions: TransactionRepository,
    eventProjection: ProtocolEventProjection,
    runtimeFactory: ChargingPointRuntimeFactory = createChargingPointRuntime,
  ) {
    this.registry = new ChargingPointRuntimeRegistry(
      eventProjection,
      runtimeFactory,
    );
  }

  listChargingPoints() {
    return this.stations.list();
  }

  async getChargingPoint(id: string) {
    const station = await this.stations.findById(id);
    if (station === null) {
      throw notFound(`桩实例 ${id} 不存在`);
    }

    const connectors = await this.stations.listConnectorSnapshots(id);
    return { station, connectors };
  }

  createChargingPoint(input: CreateChargingPointInput) {
    return this.stations.create(input);
  }

  updateChargingPoint(id: string, input: UpdateChargingPointInput) {
    return this.stations.update(id, input);
  }

  async deleteChargingPoint(id: string) {
    await this.registry.dispose(id);
    await this.stations.delete(id);
  }

  async restoreRunningChargingPoints(): Promise<void> {
    const stations = await this.stations.listByDesiredStatus("running");
    await Promise.allSettled(stations.map((station) => this.startChargingPoint(station.id)));
  }

  async startChargingPoint(id: string): Promise<ChargingPointRecord> {
    const station = await this.requireChargingPoint(id);

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

  async stopChargingPoint(id: string): Promise<void> {
    await this.requireChargingPoint(id);
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

  private requireRuntime(stationId: string): ChargingPointRuntime {
    const runtime = this.registry.get(stationId);
    if (runtime === undefined) {
      throw badRequest("桩实例未运行");
    }

    return runtime;
  }

  private async requireChargingPoint(stationId: string): Promise<ChargingPointRecord> {
    const station = await this.stations.findById(stationId);
    if (station === null) {
      throw notFound(`桩实例 ${stationId} 不存在`);
    }

    return station;
  }
}
