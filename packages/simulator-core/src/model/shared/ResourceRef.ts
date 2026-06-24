import { assertPositiveInteger } from "./invariants";

export type ResourceScope = "chargingPoint" | "evse" | "connector";

interface BaseResourceRef {
  chargingPointId: string;
}

export interface ChargingPointRef extends BaseResourceRef {
  scope: "chargingPoint";
}

export interface EvseRef extends BaseResourceRef {
  scope: "evse";
  evseId: number;
}

export interface ConnectorRef extends BaseResourceRef {
  scope: "connector";
  evseId: number;
  connectorId: number;
}

export type ResourceRef = ChargingPointRef | EvseRef | ConnectorRef;

export function createChargingPointRef(chargingPointId: string): ChargingPointRef {
  return {
    scope: "chargingPoint",
    chargingPointId,
  };
}

export function createEvseRef(
  chargingPointId: string,
  evseId: number,
): EvseRef {
  assertPositiveInteger(evseId, "evseId");

  return {
    scope: "evse",
    chargingPointId,
    evseId,
  };
}

export function createConnectorRef(
  chargingPointId: string,
  evseId: number,
  connectorId: number,
): ConnectorRef {
  assertPositiveInteger(evseId, "evseId");
  assertPositiveInteger(connectorId, "connectorId");

  return {
    scope: "connector",
    chargingPointId,
    evseId,
    connectorId,
  };
}

export function cloneResourceRef(value: ResourceRef): ResourceRef {
  switch (value.scope) {
    case "chargingPoint":
      return createChargingPointRef(value.chargingPointId);
    case "evse":
      return createEvseRef(value.chargingPointId, value.evseId);
    case "connector":
      return createConnectorRef(
        value.chargingPointId,
        value.evseId,
        value.connectorId,
      );
  }
}
