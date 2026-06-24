import {
  createSimulator,
  type Simulator,
  type SimulatorEventBus,
  type SimulatorProtocol,
} from "@spark-bee/simulator-core";
import type { ChargingPointOptions } from "@spark-bee/simulator-core/model";

import type { StationRecord } from "../repositories/station.repository";

export interface StationConnectorActionResult {
  chargingPointId: string;
  connectorId: number;
  plugState: "plugged" | "unplugged";
  vehiclePresence: "detected" | "absent";
  connectorStatus: string;
}

export type StationRuntimeStartResult =
  | {
      chargingPointId: string;
      simulatorStatus: "running";
      bootStatus: "Accepted";
    }
  | {
      chargingPointId: string;
      simulatorStatus: "starting";
      bootStatus: "Pending";
      retryAfterSec: number;
    };

export interface StationRuntimeStopResult {
  chargingPointId: string;
  simulatorStatus: "stopped";
}

export type StationRuntimeAuthorizeResult =
  | { status: "accepted" }
  | { status: "rejected"; reason: string; authorizationStatus?: string }
  | {
      status: "failed";
      errorCode: string;
      errorMessage: string;
      shouldReconnect: boolean;
    };

export interface StationRuntimeStartTransactionInput {
  connectorId: number;
  idTag: string;
  meterStartWh?: number;
  reservationId?: number;
}

export type StationRuntimeTransactionStartResult =
  | { status: "accepted"; transactionId: string }
  | { status: "rejected"; reason: string; authorizationStatus?: string };

export interface StationRuntimeMeterValueInput {
  transactionId: string;
  meterWh: number;
  sampledAt?: Date;
}

export type StationRuntimeMeterValueResult =
  | {
      status: "accepted";
      transactionId: string;
      meterWh: number;
      sampledAt: Date;
    }
  | {
      status: "failed";
      errorCode: string;
      errorMessage: string;
      shouldReconnect: boolean;
    };

export type StationRuntimeTransactionStopReason =
  | "local"
  | "remote"
  | "unlock-command"
  | "ev-disconnected"
  | "deauthorized"
  | "emergency-stop"
  | "other";

export interface StationRuntimeStopTransactionInput {
  transactionId: string;
  reason: StationRuntimeTransactionStopReason;
  meterStopWh?: number;
  stoppedAt?: Date;
  idTag?: string;
}

export type StationRuntimeStopTransactionResult =
  | {
      status: "accepted";
      transactionId: string;
      meterStopWh: number;
      stoppedAt: Date;
    }
  | {
      status: "failed";
      errorCode: string;
      errorMessage: string;
      shouldReconnect: boolean;
    };

export interface StationRuntime {
  readonly id: string;
  readonly protocol: SimulatorProtocol;
  readonly events: SimulatorEventBus;
  start(): Promise<StationRuntimeStartResult>;
  stop(): Promise<StationRuntimeStopResult>;
  dispose(): Promise<void>;
  plug(connectorId: number): Promise<StationConnectorActionResult>;
  unplug(connectorId: number): Promise<StationConnectorActionResult>;
  authorize(input: { connectorId: number; idTag: string }): Promise<StationRuntimeAuthorizeResult>;
  startTransaction(input: StationRuntimeStartTransactionInput): Promise<StationRuntimeTransactionStartResult>;
  reportMeterValue(input: StationRuntimeMeterValueInput): Promise<StationRuntimeMeterValueResult>;
  stopTransaction(input: StationRuntimeStopTransactionInput): Promise<StationRuntimeStopTransactionResult>;
}

export type StationRuntimeFactory = (station: StationRecord) => StationRuntime;

export function createStationRuntime(station: StationRecord): StationRuntime {
  return new SimulatorStationRuntime(createSimulator({
    protocol: "OCPP16J",
    id: station.identity,
    centralSystemUrl: buildOcppUrl(station.csmsBaseUrl, station.identity),
    chargingPoint: toChargingPointOptions(station)
  }));
}

class SimulatorStationRuntime implements StationRuntime {
  readonly id: string;
  readonly protocol: SimulatorProtocol;
  readonly events: SimulatorEventBus;

  constructor(private readonly simulator: Simulator) {
    this.id = simulator.id;
    this.protocol = simulator.protocol as SimulatorProtocol;
    this.events = simulator.events;
  }

  start(): Promise<StationRuntimeStartResult> {
    return this.simulator.start();
  }

  stop(): Promise<StationRuntimeStopResult> {
    return this.simulator.stop();
  }

  dispose(): Promise<void> {
    return this.simulator.dispose();
  }

  async plug(connectorId: number): Promise<StationConnectorActionResult> {
    const result = await this.simulator.plug(toCoreConnectorRef(connectorId));
    return toStationConnectorActionResult(result);
  }

  async unplug(connectorId: number): Promise<StationConnectorActionResult> {
    const result = await this.simulator.unplug(toCoreConnectorRef(connectorId));
    return toStationConnectorActionResult(result);
  }

  authorize(input: { connectorId: number; idTag: string }): Promise<StationRuntimeAuthorizeResult> {
    return this.simulator.authorize({
      ...toCoreConnectorRef(input.connectorId),
      idTag: input.idTag
    });
  }

  startTransaction(
    input: StationRuntimeStartTransactionInput,
  ): Promise<StationRuntimeTransactionStartResult> {
    return this.simulator.startTransaction({
      ...toCoreConnectorRef(input.connectorId),
      idTag: input.idTag,
      meterStartWh: input.meterStartWh,
      reservationId: input.reservationId
    });
  }

  reportMeterValue(input: StationRuntimeMeterValueInput): Promise<StationRuntimeMeterValueResult> {
    return this.simulator.reportMeterValue(input);
  }

  stopTransaction(input: StationRuntimeStopTransactionInput): Promise<StationRuntimeStopTransactionResult> {
    return this.simulator.stopTransaction(input);
  }
}

function buildOcppUrl(baseUrl: string, identity: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBase}/${encodeURIComponent(identity)}`;
}

function toCoreConnectorRef(connectorId: number): { evseId: number; connectorId: number } {
  return { evseId: connectorId, connectorId };
}

function toStationConnectorActionResult(input: {
  chargingPointId: string;
  connectorId: number;
  plugState: "plugged" | "unplugged";
  vehiclePresence: "detected" | "absent";
  connectorStatus: string;
}): StationConnectorActionResult {
  return {
    chargingPointId: input.chargingPointId,
    connectorId: input.connectorId,
    plugState: input.plugState,
    vehiclePresence: input.vehiclePresence,
    connectorStatus: input.connectorStatus
  };
}

function toChargingPointOptions(station: StationRecord): ChargingPointOptions {
  return {
    id: station.identity,
    vendor: station.vendor,
    model: station.model,
    availability: "operative",
    evses: Array.from({ length: station.connectorCount }, (_, index) => {
      const connectorId = index + 1;
      return {
        id: connectorId,
        connectors: [
          {
            id: connectorId,
            type: "Type2",
            format: "socket",
            powerType: "ac",
            maxPower: station.connectorMaxPowerW,
            plugState: "unplugged",
            vehiclePresence: "absent",
            availability: "operative"
          }
        ]
      };
    })
  };
}
