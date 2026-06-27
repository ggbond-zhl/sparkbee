import type { ChargingPointDetailResponse, ConnectorResponse } from "@spark-bee/contracts";

import type {
  ChargingPointActorOptions,
  ChargingPointActorProtocol,
} from "../../lib/chargingPointActor";
import { AppError } from "../../utils/errors";

export function toChargingPointActorOptions(
  chargingPoint: ChargingPointDetailResponse,
): ChargingPointActorOptions {
  if (chargingPoint.protocol !== "OCPP16J") {
    throw new AppError(
      400,
      "CHARGING_POINT_PROTOCOL_UNSUPPORTED",
      "Charging point protocol is not supported",
    );
  }

  return {
    protocol: chargingPoint.protocol as ChargingPointActorProtocol,
    id: chargingPoint.id,
    centralSystemUrl: chargingPoint.centralSystemUrl,
    chargingPoint: {
      id: chargingPoint.identity,
      vendor: chargingPoint.vendor,
      model: chargingPoint.model,
      firmwareVersion: chargingPoint.firmwareVersion ?? undefined,
      serialNumber: chargingPoint.serialNumber ?? undefined,
      evses: toEvses(chargingPoint.connectors),
    },
  };
}

function toEvses(connectors: ConnectorResponse[]) {
  const evses = new Map<number, { id: number; connectors: ReturnType<typeof toConnector>[] }>();

  for (const connector of connectors) {
    const evse = evses.get(connector.evseId) ?? {
      id: connector.evseId,
      connectors: [],
    };
    evse.connectors.push(toConnector(connector));
    evses.set(connector.evseId, evse);
  }

  return [...evses.values()].sort((left, right) => left.id - right.id);
}

function toConnector(connector: ConnectorResponse) {
  return {
    id: connector.connectorId,
    type: connector.type,
    format: connector.format,
    powerType: connector.powerType,
    maxVoltage: connector.maxVoltage ?? undefined,
    maxCurrent: connector.maxCurrent ?? undefined,
    maxPower: connector.maxPower ?? undefined,
  };
}
