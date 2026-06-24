export interface Station {
  id: string;
  name: string;
  protocol: "OCPP16J";
  csmsBaseUrl: string;
  identity: string;
  vendor: string;
  model: string;
  connectorCount: number;
  connectorMaxPowerW: number;
  desiredStatus: "running" | "stopped";
  runtimeStatus: "starting" | "running" | "stopped";
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorSnapshot {
  connectorId: number;
  status: string;
  plugState: string;
  vehiclePresence: string;
  updatedAt: string;
}

export interface StationDetail {
  station: Station;
  connectors: ConnectorSnapshot[];
}

export interface EventRecord {
  id: string;
  stationId: string | null;
  type: string;
  payload: unknown;
  protocolMessage: boolean;
  occurredAt: string;
}

export interface StationFormInput {
  name: string;
  csmsBaseUrl: string;
  identity: string;
  vendor: string;
  model: string;
  connectorCount: number;
  connectorMaxPowerW: number;
}
