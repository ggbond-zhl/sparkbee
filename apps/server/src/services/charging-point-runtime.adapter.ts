import {
  createChargingPointSimulator,
  type ChargingPointSimulator,
  type ChargingPointSimulatorEvent,
  type ChargingPointSimulatorEventBus,
  type ChargingPointSimulatorEventType,
  type ChargingPointSimulatorProtocol,
} from "@spark-bee/simulator-core";
import type { ChargingPointOptions } from "@spark-bee/simulator-core/model";

import type { ChargingPointRecord } from "../repositories/charging-point.repository";

export type ChargingPointRuntimeEvent = ChargingPointSimulatorEvent;
export type ChargingPointRuntimeEventBus = ChargingPointSimulatorEventBus;
export type ChargingPointRuntimeEventType = ChargingPointSimulatorEventType;

export interface ChargingPointConnectorActionResult {
  chargingPointId: string;
  connectorId: number;
  plugState: "plugged" | "unplugged";
  vehiclePresence: "detected" | "absent";
  connectorStatus: string;
}

export type ChargingPointRuntimeStartResult =
  | {
      chargingPointId: string;
      chargingPointSimulatorStatus: "running";
      bootStatus: "Accepted";
    }
  | {
      chargingPointId: string;
      chargingPointSimulatorStatus: "starting";
      bootStatus: "Pending";
      retryAfterSec: number;
    };

export interface ChargingPointRuntimeStopResult {
  chargingPointId: string;
  chargingPointSimulatorStatus: "stopped";
}

export type ChargingPointRuntimeAuthorizeResult =
  | { status: "accepted" }
  | { status: "rejected"; reason: string; authorizationStatus?: string }
  | {
      status: "failed";
      errorCode: string;
      errorMessage: string;
      shouldReconnect: boolean;
    };

export interface ChargingPointRuntimeStartTransactionInput {
  connectorId: number;
  idTag: string;
  meterStartWh?: number;
  reservationId?: number;
}

export type ChargingPointRuntimeTransactionStartResult =
  | { status: "accepted"; transactionId: string }
  | { status: "rejected"; reason: string; authorizationStatus?: string };

export interface ChargingPointRuntimeMeterValueInput {
  transactionId: string;
  meterWh: number;
  sampledAt?: Date;
}

export type ChargingPointRuntimeMeterValueResult =
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

export type ChargingPointRuntimeTransactionStopReason =
  | "local"
  | "remote"
  | "unlock-command"
  | "ev-disconnected"
  | "deauthorized"
  | "emergency-stop"
  | "other";

export interface ChargingPointRuntimeStopTransactionInput {
  transactionId: string;
  reason: ChargingPointRuntimeTransactionStopReason;
  meterStopWh?: number;
  stoppedAt?: Date;
  idTag?: string;
}

export type ChargingPointRuntimeStopTransactionResult =
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

export interface ChargingPointRuntime {
  readonly id: string;
  readonly protocol: ChargingPointSimulatorProtocol;
  readonly events: ChargingPointRuntimeEventBus;
  start(): Promise<ChargingPointRuntimeStartResult>;
  stop(): Promise<ChargingPointRuntimeStopResult>;
  dispose(): Promise<void>;
  plug(connectorId: number): Promise<ChargingPointConnectorActionResult>;
  unplug(connectorId: number): Promise<ChargingPointConnectorActionResult>;
  authorize(input: { connectorId: number; idTag: string }): Promise<ChargingPointRuntimeAuthorizeResult>;
  startTransaction(input: ChargingPointRuntimeStartTransactionInput): Promise<ChargingPointRuntimeTransactionStartResult>;
  reportMeterValue(input: ChargingPointRuntimeMeterValueInput): Promise<ChargingPointRuntimeMeterValueResult>;
  stopTransaction(input: ChargingPointRuntimeStopTransactionInput): Promise<ChargingPointRuntimeStopTransactionResult>;
}

export type ChargingPointRuntimeFactory = (chargingPoint: ChargingPointRecord) => ChargingPointRuntime;

export function createChargingPointRuntime(chargingPoint: ChargingPointRecord): ChargingPointRuntime {
  return new ChargingPointRuntimeAdapter(createChargingPointSimulator({
    protocol: "OCPP16J",
    id: chargingPoint.identity,
    centralSystemUrl: buildOcppUrl(chargingPoint.csmsBaseUrl, chargingPoint.identity),
    chargingPoint: toChargingPointOptions(chargingPoint)
  }));
}

class ChargingPointRuntimeAdapter implements ChargingPointRuntime {
  readonly id: string;
  readonly protocol: ChargingPointSimulatorProtocol;
  readonly events: ChargingPointSimulatorEventBus;

  constructor(private readonly simulator: ChargingPointSimulator) {
    this.id = simulator.id;
    this.protocol = simulator.protocol as ChargingPointSimulatorProtocol;
    this.events = simulator.events;
  }

  start(): Promise<ChargingPointRuntimeStartResult> {
    return this.simulator.start();
  }

  stop(): Promise<ChargingPointRuntimeStopResult> {
    return this.simulator.stop();
  }

  dispose(): Promise<void> {
    return this.simulator.dispose();
  }

  async plug(connectorId: number): Promise<ChargingPointConnectorActionResult> {
    const result = await this.simulator.plug(toCoreConnectorRef(connectorId));
    return toChargingPointConnectorActionResult(result);
  }

  async unplug(connectorId: number): Promise<ChargingPointConnectorActionResult> {
    const result = await this.simulator.unplug(toCoreConnectorRef(connectorId));
    return toChargingPointConnectorActionResult(result);
  }

  authorize(input: { connectorId: number; idTag: string }): Promise<ChargingPointRuntimeAuthorizeResult> {
    return this.simulator.authorize({
      ...toCoreConnectorRef(input.connectorId),
      idTag: input.idTag
    });
  }

  startTransaction(
    input: ChargingPointRuntimeStartTransactionInput,
  ): Promise<ChargingPointRuntimeTransactionStartResult> {
    return this.simulator.startTransaction({
      ...toCoreConnectorRef(input.connectorId),
      idTag: input.idTag,
      meterStartWh: input.meterStartWh,
      reservationId: input.reservationId
    });
  }

  reportMeterValue(input: ChargingPointRuntimeMeterValueInput): Promise<ChargingPointRuntimeMeterValueResult> {
    return this.simulator.reportMeterValue(input);
  }

  stopTransaction(input: ChargingPointRuntimeStopTransactionInput): Promise<ChargingPointRuntimeStopTransactionResult> {
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

function toChargingPointConnectorActionResult(input: {
  chargingPointId: string;
  connectorId: number;
  plugState: "plugged" | "unplugged";
  vehiclePresence: "detected" | "absent";
  connectorStatus: string;
}): ChargingPointConnectorActionResult {
  return {
    chargingPointId: input.chargingPointId,
    connectorId: input.connectorId,
    plugState: input.plugState,
    vehiclePresence: input.vehiclePresence,
    connectorStatus: input.connectorStatus
  };
}

function toChargingPointOptions(station: ChargingPointRecord): ChargingPointOptions {
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
