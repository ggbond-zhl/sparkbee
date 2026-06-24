import type {
  CreateStationInput,
  StationRepository,
  UpdateStationInput
} from "../repositories/station.repository";
import type { TransactionRepository } from "../repositories/transaction.repository";
import { notFound } from "../utils/errors";
import type { RuntimeService } from "./runtime.service";

export class StationService {
  constructor(
    private readonly stations: StationRepository,
    private readonly runtime: RuntimeService,
    private readonly transactions: TransactionRepository,
  ) {}

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
    await this.runtime.disposeStation(id);
    await this.stations.delete(id);
  }

  restoreRunningStations(): Promise<void> {
    return this.runtime.restoreRunningStations();
  }

  startStation(id: string) {
    return this.runtime.startStation(id);
  }

  async stopStation(id: string): Promise<void> {
    await this.runtime.stopStation(id);
  }

  plug(id: string, connectorId: number) {
    return this.runtime.plug(id, connectorId);
  }

  unplug(id: string, connectorId: number) {
    return this.runtime.unplug(id, connectorId);
  }

  authorize(id: string, input: { connectorId: number; idTag: string }) {
    return this.runtime.authorize(id, input);
  }

  async startTransaction(
    id: string,
    input: { connectorId: number; idTag: string; meterStartWh?: number },
  ) {
    const result = await this.runtime.startTransaction(id, input);

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
    return this.runtime.reportMeterValue(id, input);
  }

  async stopTransaction(
    id: string,
    input: {
      transactionId: string;
      reason: "local" | "remote" | "unlock-command" | "ev-disconnected" | "deauthorized" | "emergency-stop" | "other";
      meterStopWh?: number;
    },
  ) {
    const result = await this.runtime.stopTransaction(id, input);

    if (result.status === "accepted") {
      await this.transactions.markEnded({
        simulatorTransactionId: result.transactionId,
        meterStopWh: result.meterStopWh,
        stoppedAt: result.stoppedAt
      });
    }

    return result;
  }
}
