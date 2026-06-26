export type ChargingPointDesiredStatus = "running" | "stopped";
export type ChargingPointRuntimeStatus = "starting" | "running" | "stopped";

export interface ChargingPointRecord {
  id: string;
  name: string;
  protocol: "OCPP16J";
  csmsBaseUrl: string;
  identity: string;
  vendor: string;
  model: string;
  connectorCount: number;
  connectorMaxPowerW: number;
  desiredStatus: ChargingPointDesiredStatus;
  runtimeStatus: ChargingPointRuntimeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectorSnapshotRecord {
  connectorId: number;
  status: string;
  plugState: string;
  vehiclePresence: string;
  updatedAt: Date;
}

export interface CreateChargingPointInput {
  name: string;
  csmsBaseUrl: string;
  identity: string;
  vendor: string;
  model: string;
  connectorCount: number;
  connectorMaxPowerW: number;
}

export interface UpdateChargingPointInput extends Partial<CreateChargingPointInput> {}

export interface UpsertConnectorSnapshotInput {
  connectorId: number;
  plugState?: string;
  status: string;
  vehiclePresence?: string;
}

export interface ChargingPointRepository {
  create(input: CreateChargingPointInput): Promise<ChargingPointRecord>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<ChargingPointRecord | null>;
  list(): Promise<ChargingPointRecord[]>;
  listByDesiredStatus(status: ChargingPointDesiredStatus): Promise<ChargingPointRecord[]>;
  listConnectorSnapshots(stationId: string): Promise<ConnectorSnapshotRecord[]>;
  update(id: string, input: UpdateChargingPointInput): Promise<ChargingPointRecord>;
  updateDesiredStatus(id: string, status: ChargingPointDesiredStatus): Promise<void>;
  updateRuntimeStatus(id: string, status: ChargingPointRuntimeStatus): Promise<void>;
  upsertConnectorSnapshot(stationId: string, input: UpsertConnectorSnapshotInput): Promise<void>;
}
