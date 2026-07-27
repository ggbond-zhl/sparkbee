import {
  ConfigurationCatalog,
  type ConfigurationEntry,
  type ConfigurationEntryOptions,
} from "../../../../model";
import { ProtocolRuntimeError } from "../errors";

export type ConfigurationAccess = "R" | "RW" | "R/RW";

export interface ConfigurationDefinition
  extends Omit<ConfigurationEntryOptions, "value" | "updatedAt"> {
  key: string;
  access: ConfigurationAccess;
  defaultValue: string;
  description: string;
}

export const configurationDefinitions = [
  {
    key: "AllowOfflineTxForUnknownId",
    access: "RW",
    defaultValue: "false",
    valueType: "boolean",
    description: "离线且无法校验未知 idTag 时，是否允许先启动交易。",
  },
  {
    key: "AuthorizationCacheEnabled",
    access: "RW",
    defaultValue: "true",
    valueType: "boolean",
    description: "是否启用授权缓存，用于复用中心系统曾返回的授权结果。",
  },
  {
    key: "AuthorizeRemoteTxRequests",
    access: "R/RW",
    defaultValue: "false",
    valueType: "boolean",
    description: "远程启动交易前，是否像本地刷卡一样先执行授权流程。",
  },
  {
    key: "BlinkRepeat",
    access: "RW",
    defaultValue: "0",
    valueType: "integer",
    minValue: 0,
    description: "指示灯闪烁次数，例如远程解锁或提示用户插枪时使用。",
  },
  {
    key: "ClockAlignedDataInterval",
    access: "RW",
    defaultValue: "0",
    valueType: "integer",
    minValue: 0,
    description: "按自然时间边界对齐上报 MeterValues 的间隔，单位秒；0 表示不启用对齐上报。",
  },
  {
    key: "ConnectionTimeOut",
    access: "RW",
    defaultValue: "60",
    valueType: "integer",
    minValue: 0,
    description: "进入 Preparing 后等待用户真正开始交易的超时时间，单位秒。",
  },
  {
    key: "ConnectorPhaseRotation",
    access: "RW",
    defaultValue: "",
    description: "每个 connector 的相序配置，多个值以逗号分隔。",
  },
  {
    key: "ConnectorPhaseRotationMaxLength",
    access: "R",
    defaultValue: "1",
    valueType: "integer",
    minValue: 0,
    description: "ConnectorPhaseRotation 最多允许配置的项数。",
  },
  {
    key: "GetConfigurationMaxKeys",
    access: "R",
    defaultValue: "20",
    valueType: "integer",
    minValue: 1,
    description: "一次 GetConfiguration.req 最多能请求的 configuration key 数量。",
  },
  {
    key: "HeartbeatInterval",
    access: "RW",
    defaultValue: "60",
    valueType: "integer",
    minValue: 1,
    description: "桩向中心系统发送 Heartbeat.req 的间隔，单位秒；BootNotification Accepted 后同步为中心系统返回的 interval。",
  },
  {
    key: "LightIntensity",
    access: "RW",
    defaultValue: "100",
    valueType: "integer",
    minValue: 0,
    description: "桩灯光亮度百分比。",
  },
  {
    key: "LocalAuthorizeOffline",
    access: "RW",
    defaultValue: "true",
    valueType: "boolean",
    description: "离线时是否允许本地已授权的 idTag 启动交易。",
  },
  {
    key: "LocalPreAuthorize",
    access: "RW",
    defaultValue: "false",
    valueType: "boolean",
    description: "在线时本地已授权的 idTag 是否可以不等待 Authorize.conf 就先启动交易。",
  },
  {
    key: "MaxEnergyOnInvalidId",
    access: "RW",
    defaultValue: "0",
    valueType: "integer",
    minValue: 0,
    description: "交易开始后中心系统返回该 idTag 无效时，最多允许继续输出的 Wh。",
  },
  {
    key: "MeterValuesAlignedData",
    access: "RW",
    defaultValue: "",
    description: "按 ClockAlignedDataInterval 对齐上报的 measurand 列表，多个值以逗号分隔。",
  },
  {
    key: "MeterValuesAlignedDataMaxLength",
    access: "R",
    defaultValue: "10",
    valueType: "integer",
    minValue: 0,
    description: "MeterValuesAlignedData 最多可包含的 measurand 数量。",
  },
  {
    key: "MeterValuesSampledData",
    access: "RW",
    defaultValue: "Energy.Active.Import.Register,Power.Active.Import,Current.Import,Voltage",
    description: "按 MeterValueSampleInterval 周期上报的 measurand 列表，多个值以逗号分隔。",
  },
  {
    key: "MeterValuesSampledDataMaxLength",
    access: "R",
    defaultValue: "10",
    valueType: "integer",
    minValue: 0,
    description: "MeterValuesSampledData 最多可包含的 measurand 数量。",
  },
  {
    key: "MeterValueSampleInterval",
    access: "RW",
    defaultValue: "60",
    valueType: "integer",
    minValue: 0,
    description: "交易中周期采样 MeterValues 的间隔，单位秒。",
  },
  {
    key: "MinimumStatusDuration",
    access: "RW",
    defaultValue: "0",
    valueType: "integer",
    minValue: 0,
    description: "connector 状态至少稳定多久才上报 StatusNotification，单位秒。",
  },
  {
    key: "NumberOfConnectors",
    access: "R",
    defaultValue: "1",
    valueType: "integer",
    minValue: 1,
    description: "桩对 OCPP 1.6 暴露的 connector 数量；运行时会按当前充电桩拓扑同步。",
  },
  {
    key: "ResetRetries",
    access: "RW",
    defaultValue: "3",
    valueType: "integer",
    minValue: 0,
    description: "执行 reset 失败时的重试次数。",
  },
  {
    key: "StopTransactionOnEVSideDisconnect",
    access: "RW",
    defaultValue: "true",
    valueType: "boolean",
    description: "EV 侧断开连接后是否自动停止当前交易。",
  },
  {
    key: "StopTransactionOnInvalidId",
    access: "RW",
    defaultValue: "true",
    valueType: "boolean",
    description: "StartTransaction.conf 返回非 Accepted 授权状态时，是否停止当前交易。",
  },
  {
    key: "StopTxnAlignedData",
    access: "RW",
    defaultValue: "",
    description: "StopTransaction.req.transactionData 中包含的时间对齐采样 measurand 列表。",
  },
  {
    key: "StopTxnAlignedDataMaxLength",
    access: "R",
    defaultValue: "10",
    valueType: "integer",
    minValue: 0,
    description: "StopTxnAlignedData 最多可包含的项数。",
  },
  {
    key: "StopTxnSampledData",
    access: "RW",
    defaultValue: "Energy.Active.Import.Register",
    description: "StopTransaction.req.transactionData 中包含的周期采样 measurand 列表。",
  },
  {
    key: "StopTxnSampledDataMaxLength",
    access: "R",
    defaultValue: "10",
    valueType: "integer",
    minValue: 0,
    description: "StopTxnSampledData 最多可包含的项数。",
  },
  {
    key: "SupportedFeatureProfiles",
    access: "R",
    defaultValue: "Core",
    description: "桩支持的 Feature Profile 列表，多个 profile 以逗号分隔。",
  },
  {
    key: "SupportedFeatureProfilesMaxLength",
    access: "R",
    defaultValue: "1",
    valueType: "integer",
    minValue: 0,
    description: "SupportedFeatureProfiles 最多可包含的项数。",
  },
  {
    key: "TransactionMessageAttempts",
    access: "RW",
    defaultValue: "3",
    valueType: "integer",
    minValue: 1,
    description: "交易相关消息发送失败时最多重试次数。",
  },
  {
    key: "TransactionMessageRetryInterval",
    access: "RW",
    defaultValue: "60",
    valueType: "integer",
    minValue: 0,
    description: "交易相关消息发送失败后的重试间隔，单位秒。",
  },
  {
    key: "UnlockConnectorOnEVSideDisconnect",
    access: "RW",
    defaultValue: "true",
    valueType: "boolean",
    description: "EV 侧断开连接后是否解锁桩侧电缆。",
  },
  {
    key: "WebSocketPingInterval",
    access: "RW",
    defaultValue: "0",
    valueType: "integer",
    minValue: 0,
    description: "WebSocket Ping 间隔，单位秒；0 表示禁用客户端 Ping/Pong。",
  },
  {
    key: "StopTransactionMaxMeterValues",
    access: "R",
    defaultValue: "10",
    valueType: "integer",
    minValue: 0,
    description: "StopTransaction.req.transactionData 中最多允许包含的 MeterValues 数量。",
  },
  {
    key: "LocalAuthListEnabled",
    access: "RW",
    defaultValue: "true",
    valueType: "boolean",
    description: "是否启用本地授权列表。",
  },
  {
    key: "LocalAuthListMaxLength",
    access: "R",
    defaultValue: "99",
    valueType: "integer",
    minValue: 0,
    description: "本地授权列表最多能存储的 idTag 数量。",
  },
  {
    key: "SendLocalListMaxLength",
    access: "R",
    defaultValue: "99",
    valueType: "integer",
    minValue: 0,
    description: "一次 SendLocalList.req 最多能下发的 idTag 数量。",
  },
  {
    key: "ReserveConnectorZeroSupported",
    access: "R",
    defaultValue: "false",
    valueType: "boolean",
    description: "是否支持预约 connector 0。",
  },
  {
    key: "ChargeProfileMaxStackLevel",
    access: "R",
    defaultValue: "0",
    valueType: "integer",
    minValue: 0,
    description: "支持的最大 ChargingProfile stackLevel。",
  },
  {
    key: "ChargingScheduleAllowedChargingRateUnit",
    access: "R",
    defaultValue: "",
    description: "支持的 ChargingSchedule 限流单位列表，多个值以逗号分隔。",
  },
  {
    key: "ChargingScheduleMaxPeriods",
    access: "R",
    defaultValue: "0",
    valueType: "integer",
    minValue: 0,
    description: "一个 ChargingSchedule 中最多允许的 period 数量。",
  },
  {
    key: "ConnectorSwitch3to1PhaseSupported",
    access: "R",
    defaultValue: "false",
    valueType: "boolean",
    description: "是否支持交易中从三相切换到单相。",
  },
  {
    key: "MaxChargingProfilesInstalled",
    access: "R",
    defaultValue: "0",
    valueType: "integer",
    minValue: 0,
    description: "桩内最多能同时安装的 ChargingProfile 数量。",
  },
  {
    key: "SupportedFileTransferProtocols",
    access: "R",
    defaultValue: "",
    description: "桩支持的文件传输协议列表，多个值以逗号分隔。",
  },
] as const satisfies readonly ConfigurationDefinition[];

export type Ocpp16ConfigurationKey =
  typeof configurationDefinitions[number]["key"];

export type Ocpp16ConfigurationKeyInput =
  | Ocpp16ConfigurationKey
  | (string & {});

export function createDefaultConfigurationEntries(): ConfigurationEntryOptions[] {
  return configurationDefinitions.map(createEntryOptions);
}

export function ensureConfigurationDefinitions(
  catalog: ConfigurationCatalog,
): ConfigurationCatalog {
  let hasMissingEntry = false;
  for (const definition of configurationDefinitions) {
    const entry = catalog.getEntry(definition.key);
    if (entry === undefined) {
      hasMissingEntry = true;
      continue;
    }

    assertEntryMatchesDefinition(entry, definition);
  }

  if (!hasMissingEntry) {
    return catalog;
  }

  const entries: Array<ConfigurationEntry | ConfigurationEntryOptions> = [
    ...catalog.listEntries(),
  ];
  for (const definition of configurationDefinitions) {
    if (catalog.getEntry(definition.key) === undefined) {
      entries.push(createEntryOptions(definition));
    }
  }

  return new ConfigurationCatalog({
    chargingPointId: catalog.chargingPointId,
    protocolVersion: catalog.protocolVersion,
    entries,
  });
}

function createEntryOptions(
  definition: ConfigurationDefinition,
): ConfigurationEntryOptions {
  return {
    key: definition.key,
    value: definition.defaultValue,
    readonly: definition.readonly ?? definition.access === "R",
    valueType: definition.valueType,
    rebootRequired: definition.rebootRequired,
    minValue: definition.minValue,
    maxValue: definition.maxValue,
  };
}

function assertEntryMatchesDefinition(
  entry: ConfigurationEntry,
  definition: ConfigurationDefinition,
): void {
  if (
    entry.valueType !== (definition.valueType ?? "string")
  ) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      `${definition.key} 配置类型不匹配`,
    );
  }

  if (entry.minValue !== definition.minValue) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      `${definition.key} 最小值不匹配`,
    );
  }

  if (entry.maxValue !== definition.maxValue) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      `${definition.key} 最大值不匹配`,
    );
  }

  if (definition.access === "R" && !entry.isReadonly) {
    throw new ProtocolRuntimeError(
      "PROTOCOL_RUNTIME_INVALID_OPERATION",
      `${definition.key} 必须是只读配置`,
    );
  }
}
