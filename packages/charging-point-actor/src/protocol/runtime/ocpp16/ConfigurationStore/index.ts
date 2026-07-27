import {
  ConfigurationCatalog,
  type ConfigurationCatalogOptions,
  type ConfigurationChangeStatus,
  type ConfigurationEntry,
} from "../../../../model";
import type { ChangeConfigurationResponse } from "../../../validator/Ocpp16/schemas/ChangeConfigurationResponse";
import { ProtocolRuntimeError } from "../errors";
import {
  createDefaultConfigurationEntries,
  ensureConfigurationDefinitions,
  type Ocpp16ConfigurationKeyInput,
} from "./configurationDefinitions";

export {
  configurationDefinitions,
  type ConfigurationDefinition,
  type Ocpp16ConfigurationKey,
  type Ocpp16ConfigurationKeyInput,
} from "./configurationDefinitions";
export {
  normalizeConfigurationValue,
  type ConfigurationValueDefinition,
} from "../../../../model";

export type Ocpp16ConfigurationCatalogInput =
  | ConfigurationCatalog
  | ConfigurationCatalogOptions;
export type Ocpp16ChangeConfigurationStatus =
  ChangeConfigurationResponse["status"];
export type Ocpp16ConfigurationChangeSource = "csms" | "internal" | "ui";

export interface Ocpp16PersistedConfigurationEntry {
  key: string;
  value: string;
  version: number;
  updatedAt: Date;
  lastModifiedBy: Ocpp16ConfigurationChangeSource | "initialization";
  pendingRestart: boolean;
}

export interface Ocpp16ConfigurationChangeResult {
  status: Ocpp16ChangeConfigurationStatus;
  entry?: Ocpp16PersistedConfigurationEntry;
}

export interface Ocpp16ConfigurationPersistence {
  save(input: {
    key: string;
    value: string;
    source: Ocpp16ConfigurationChangeSource;
    pendingRestart: boolean;
    updatedAt: Date;
    expectedVersion?: number;
  }): Promise<Ocpp16PersistedConfigurationEntry>;
  markApplied?(updatedAt: Date): Promise<Ocpp16PersistedConfigurationEntry[]>;
}

export class ConfigurationStore {
  private catalog: ConfigurationCatalog;
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    chargingPointId: string,
    input?: Ocpp16ConfigurationCatalogInput,
    private readonly persistence: Ocpp16ConfigurationPersistence = {
      save: (saveInput) => Promise.resolve({
        key: saveInput.key,
        value: saveInput.value,
        version: (saveInput.expectedVersion ?? 0) + 1,
        updatedAt: saveInput.updatedAt,
        lastModifiedBy: saveInput.source,
        pendingRestart: saveInput.pendingRestart,
      }),
      markApplied: () => Promise.resolve([]),
    },
  ) {
    this.catalog = normalizeOcpp16ConfigurationCatalog(chargingPointId, input);
  }

  /**
   * 读取协议配置项及其元数据。
   * 用于 GetConfiguration 等需要返回 readonly/value 的协议场景。
   */
  getEntry(key: Ocpp16ConfigurationKeyInput): ConfigurationEntry | undefined {
    return this.catalog.getEntry(key);
  }

  /**
   * 读取协议配置项当前值。
   * 用于运行时只关心值本身的内部逻辑。
   */
  getValue(key: Ocpp16ConfigurationKeyInput): string | undefined {
    return this.catalog.getEntry(key)?.value;
  }

  /**
   * 列出当前全部协议配置项。
   * 用于 GetConfiguration 等需要枚举配置目录的协议场景。
   */
  listEntries(): ConfigurationEntry[] {
    return this.catalog.listEntries();
  }

  /**
   * 应用中心系统通过协议下发的配置变更。
   * 会尊重 readonly、类型和值域限制，并返回模型层配置变更状态。
   */
  change(
    key: Ocpp16ConfigurationKeyInput,
    nextValue: string,
    at: Date,
  ): Ocpp16ChangeConfigurationStatus {
    const result = this.catalog.changeValue(key, nextValue, at);
    this.catalog = result.catalog;
    return mapConfigurationChangeStatus(result.status);
  }

  async changeAndPersist(
    key: Ocpp16ConfigurationKeyInput,
    nextValue: string,
    at: Date,
    source: Extract<Ocpp16ConfigurationChangeSource, "csms" | "ui"> = "csms",
    expectedVersion?: number,
  ): Promise<Ocpp16ConfigurationChangeResult> {
    return this.runExclusive(() =>
      this.changeAndPersistNow(key, nextValue, at, source, expectedVersion)
    );
  }

  private async changeAndPersistNow(
    key: Ocpp16ConfigurationKeyInput,
    nextValue: string,
    at: Date,
    source: Extract<Ocpp16ConfigurationChangeSource, "csms" | "ui">,
    expectedVersion?: number,
  ): Promise<Ocpp16ConfigurationChangeResult> {
    const result = this.catalog.changeValue(key, nextValue, at);
    const status = mapConfigurationChangeStatus(result.status);
    if (status !== "Accepted" && status !== "RebootRequired") {
      return { status };
    }

    const entry = result.catalog.getEntry(key);
    if (entry === undefined) {
      return { status: "NotSupported" };
    }

    const persistedEntry = await this.persistence.save({
      key: entry.key,
      value: entry.value,
      source,
      expectedVersion,
      pendingRestart: status === "RebootRequired",
      updatedAt: at,
    });
    this.catalog = result.catalog;
    return { status, entry: persistedEntry };
  }

  /**
   * 同步本地运行时确认过的协议事实。
   * 用于 BootNotification Accepted 等内部同步，不受 readonly 限制。
   */
  sync(key: Ocpp16ConfigurationKeyInput, nextValue: string, at: Date): void {
    try {
      const result = this.catalog.syncValue(key, nextValue, at);
      this.catalog = result.catalog;
    } catch (cause) {
      throw new ProtocolRuntimeError(
        "PROTOCOL_RUNTIME_INVALID_OPERATION",
        `协议配置项 ${key} 同步失败`,
        cause,
      );
    }
  }

  async syncAndPersist(
    key: Ocpp16ConfigurationKeyInput,
    nextValue: string,
    at: Date,
  ): Promise<Ocpp16PersistedConfigurationEntry | null> {
    return this.runExclusive(() => this.syncAndPersistNow(key, nextValue, at));
  }

  markApplied(at: Date): Promise<Ocpp16PersistedConfigurationEntry[]> {
    return this.runExclusive(() => this.persistence.markApplied?.(at) ?? Promise.resolve([]));
  }

  private async syncAndPersistNow(
    key: Ocpp16ConfigurationKeyInput,
    nextValue: string,
    at: Date,
  ): Promise<Ocpp16PersistedConfigurationEntry | null> {
    try {
      const result = this.catalog.syncValue(key, nextValue, at);
      if (!result.changed) {
        return null;
      }

      const entry = result.catalog.getEntry(key);
      if (entry === undefined) {
        throw new Error(`协议配置项 ${key} 不存在`);
      }

      const persistedEntry = await this.persistence.save({
        key: entry.key,
        value: entry.value,
        source: "internal",
        pendingRestart: false,
        updatedAt: at,
      });
      this.catalog = result.catalog;
      return persistedEntry;
    } catch (cause) {
      throw new ProtocolRuntimeError(
        "PROTOCOL_RUNTIME_INVALID_OPERATION",
        `协议配置项 ${key} 同步失败`,
        cause,
      );
    }
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

const changeStatusByModelStatus = {
  accepted: "Accepted",
  rejected: "Rejected",
  "reboot-required": "RebootRequired",
  "not-supported": "NotSupported",
} as const satisfies Record<ConfigurationChangeStatus, Ocpp16ChangeConfigurationStatus>;

function mapConfigurationChangeStatus(
  status: ConfigurationChangeStatus,
): Ocpp16ChangeConfigurationStatus {
  return changeStatusByModelStatus[status];
}

function createDefaultOcpp16ConfigurationCatalog(
  chargingPointId: string,
): ConfigurationCatalog {
  return new ConfigurationCatalog({
    chargingPointId,
    protocolVersion: "OCPP16J",
    entries: createDefaultConfigurationEntries(),
  });
}

function normalizeOcpp16ConfigurationCatalog(
  chargingPointId: string,
  input?: Ocpp16ConfigurationCatalogInput,
): ConfigurationCatalog {
  if (input === undefined) {
    return createDefaultOcpp16ConfigurationCatalog(chargingPointId);
  }

  const catalog = input instanceof ConfigurationCatalog
    ? input
    : new ConfigurationCatalog(input);
  return ensureOcpp16ConfigurationCatalog(chargingPointId, catalog);
}

function ensureOcpp16ConfigurationCatalog(
  chargingPointId: string,
  catalog: ConfigurationCatalog,
): ConfigurationCatalog {
  if (catalog.chargingPointId !== chargingPointId) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      "OCPP16 配置目录充电桩不匹配",
    );
  }

  if (catalog.protocolVersion !== "OCPP16J") {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      "OCPP16 配置目录协议版本不匹配",
    );
  }

  return ensureConfigurationDefinitions(catalog);
}
