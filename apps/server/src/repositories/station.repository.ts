export type StationDesiredStatus = "running" | "stopped";
export type StationRuntimeStatus = "starting" | "running" | "stopped";

export interface StationRecord {
  id: string;
  name: string;
  protocol: "OCPP16J";
  csmsBaseUrl: string;
  identity: string;
  vendor: string;
  model: string;
  connectorCount: number;
  connectorMaxPowerW: number;
  desiredStatus: StationDesiredStatus;
  runtimeStatus: StationRuntimeStatus;
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

export interface CreateStationInput {
  name: string;
  csmsBaseUrl: string;
  identity: string;
  vendor: string;
  model: string;
  connectorCount: number;
  connectorMaxPowerW: number;
}

export interface UpdateStationInput extends Partial<CreateStationInput> {}

export interface UpsertConnectorSnapshotInput {
  connectorId: number;
  plugState?: string;
  status: string;
  vehiclePresence?: string;
}

export interface StationRepository {
  create(input: CreateStationInput): Promise<StationRecord>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<StationRecord | null>;
  list(): Promise<StationRecord[]>;
  listByDesiredStatus(status: StationDesiredStatus): Promise<StationRecord[]>;
  listConnectorSnapshots(stationId: string): Promise<ConnectorSnapshotRecord[]>;
  update(id: string, input: UpdateStationInput): Promise<StationRecord>;
  updateDesiredStatus(id: string, status: StationDesiredStatus): Promise<void>;
  updateRuntimeStatus(id: string, status: StationRuntimeStatus): Promise<void>;
  upsertConnectorSnapshot(stationId: string, input: UpsertConnectorSnapshotInput): Promise<void>;
}
