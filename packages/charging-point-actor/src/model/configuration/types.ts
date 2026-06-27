import type { ProtocolVersion } from "../../shared/types";
import type { ConfigurationCatalog } from "./ConfigurationCatalog";
import type { ConfigurationEntry } from "./ConfigurationEntry";

export type ConfigurationValueType = "string" | "integer" | "boolean";

export type ConfigurationAttributeType =
  | "Actual"
  | "Target"
  | "MinSet"
  | "MaxSet";

export interface ConfigurationComponentRef {
  name: string;
  instance?: string;
  evseId?: number;
  connectorId?: number;
}

export interface ConfigurationVariableRef {
  name: string;
  instance?: string;
}

export interface ConfigurationEntrySelector {
  key?: string;
  component?: ConfigurationComponentRef;
  variable?: ConfigurationVariableRef;
  attributeType?: ConfigurationAttributeType;
}

export type ConfigurationChangeStatus =
  | "accepted"
  | "rejected"
  | "reboot-required"
  | "not-supported";

export interface ConfigurationEntryChangeResult {
  entry: ConfigurationEntry;
  status: Exclude<ConfigurationChangeStatus, "not-supported">;
}

export interface ConfigurationEntrySyncResult {
  changed: boolean;
  entry: ConfigurationEntry;
}

export interface ConfigurationCatalogChangeResult {
  catalog: ConfigurationCatalog;
  status: ConfigurationChangeStatus;
}

export interface ConfigurationCatalogSyncResult {
  catalog: ConfigurationCatalog;
  changed: boolean;
}

export interface ConfigurationEntryOptions {
  key?: string;
  selector?: ConfigurationEntrySelector;
  value: string;
  readonly?: boolean;
  valueType?: ConfigurationValueType;
  rebootRequired?: boolean;
  minValue?: number;
  maxValue?: number;
  updatedAt?: Date | null;
}

export interface ConfigurationCatalogOptions {
  chargingPointId: string;
  protocolVersion: ProtocolVersion;
  entries?: Iterable<ConfigurationEntry | ConfigurationEntryOptions>;
}
