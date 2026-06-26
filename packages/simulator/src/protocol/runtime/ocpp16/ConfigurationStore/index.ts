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

export type Ocpp16ConfigurationCatalogInput =
  | ConfigurationCatalog
  | ConfigurationCatalogOptions;
export type Ocpp16ChangeConfigurationStatus =
  ChangeConfigurationResponse["status"];

export class ConfigurationStore {
  private catalog: ConfigurationCatalog;

  constructor(
    chargingPointId: string,
    input?: Ocpp16ConfigurationCatalogInput,
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
