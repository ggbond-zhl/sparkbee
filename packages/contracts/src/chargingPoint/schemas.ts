import { z } from "zod";

import { paginatedResponseSchema, paginationQuerySchema } from "../pagination";

export const chargingPointProtocolSchema = z.enum(["OCPP16J"]);
export const connectorFormatSchema = z.enum(["socket", "cable", "unknown"]);
export const connectorPowerTypeSchema = z.enum(["ac", "dc", "unknown"]);

const trimmedRequiredString = z.string().trim().min(1);
const trimmedRequiredIdTag = z.string().trim().min(1).max(20);
const optionalTrimmedString = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().min(1).nullable(),
);
const requiredNonNegativeIntegerSchema = z.number().int().nonnegative();

export const createChargingPointRequestSchema = z.object({
  name: trimmedRequiredString.describe("桩实例在 SparkBee 内部使用的展示名称。"),
  description: optionalTrimmedString
    .optional()
    .describe("桩实例的备注说明，空字符串会保存为 null。"),
  identity: trimmedRequiredString
    .regex(/^[A-Za-z0-9_.-]+$/)
    .describe("桩实例连接 CSMS 时使用的 charge point identity。"),
  protocol: chargingPointProtocolSchema.describe("桩实例使用的 OCPP 协议版本。"),
  centralSystemUrl: trimmedRequiredString.describe(
    "CSMS 基础 WebSocket 地址，仅允许 ws:// 或 wss://，不包含最终桩身份路径。",
  ),
  vendor: trimmedRequiredString.describe("桩实例上报给 CSMS 的厂商名称。"),
  model: trimmedRequiredString.describe("桩实例上报给 CSMS 的型号名称。"),
  firmwareVersion: optionalTrimmedString
    .optional()
    .describe("桩实例上报给 CSMS 的固件版本，空字符串会保存为 null。"),
  serialNumber: optionalTrimmedString
    .optional()
    .describe("桩实例上报给 CSMS 的序列号，空字符串会保存为 null。"),
});

export const updateChargingPointRequestSchema = createChargingPointRequestSchema.partial();

export const createConnectorRequestSchema = z.object({
  evseId: z.number().int().positive().describe("枪口在协议拓扑中所属的 EVSE 编号。"),
  connectorId: z
    .number()
    .int()
    .positive()
    .describe("枪口在所属桩实例内的 connectorId。"),
  type: trimmedRequiredString.describe("枪口类型，例如 Type2 或 CCS2。"),
  format: connectorFormatSchema.describe("枪口线缆形态。"),
  powerType: connectorPowerTypeSchema.describe("枪口供电类型。"),
  maxVoltage: requiredNonNegativeIntegerSchema.describe("枪口额定电压，单位 V。"),
  maxCurrent: requiredNonNegativeIntegerSchema.describe("枪口额定电流，单位 A。"),
});

export const updateConnectorRequestSchema = createConnectorRequestSchema.partial();

export const connectorResponseSchema = z.object({
  id: z.string().uuid().describe("枪口的 UUID 主键。"),
  chargingPointId: z.string().uuid().describe("所属桩实例的 UUID 主键。"),
  evseId: z.number().int().positive().describe("枪口在协议拓扑中所属的 EVSE 编号。"),
  connectorId: z
    .number()
    .int()
    .positive()
    .describe("枪口在所属桩实例内的 connectorId。"),
  type: z.string().describe("枪口类型，例如 Type2 或 CCS2。"),
  format: connectorFormatSchema.describe("枪口线缆形态。"),
  powerType: connectorPowerTypeSchema.describe("枪口供电类型。"),
  maxVoltage: z.number().int().nonnegative().nullable().describe("枪口额定电压，单位 V。"),
  maxCurrent: z.number().int().nonnegative().nullable().describe("枪口额定电流，单位 A。"),
  maxPower: z.number().int().nonnegative().nullable().describe("兼容保留的旧枪口额定功率字段，单位 W。"),
  sortOrder: z.number().int().positive().describe("枪口在所属桩实例内的展示顺序。"),
  createdAt: z.string().datetime().describe("创建时间。"),
  updatedAt: z.string().datetime().describe("最后更新时间。"),
});

export const chargingPointSummaryResponseSchema = z.object({
  id: z.string().uuid().describe("桩实例的 UUID 主键。"),
  name: z.string().describe("桩实例在 SparkBee 内部使用的展示名称。"),
  description: z.string().nullable().describe("桩实例的备注说明。"),
  identity: z.string().describe("桩实例连接 CSMS 时使用的 charge point identity。"),
  protocol: chargingPointProtocolSchema.describe("桩实例使用的 OCPP 协议版本。"),
  centralSystemUrl: z.string().describe("CSMS 基础 WebSocket 地址。"),
  vendor: z.string().describe("桩实例上报给 CSMS 的厂商名称。"),
  model: z.string().describe("桩实例上报给 CSMS 的型号名称。"),
  firmwareVersion: z.string().nullable().describe("桩实例上报给 CSMS 的固件版本。"),
  serialNumber: z.string().nullable().describe("桩实例上报给 CSMS 的序列号。"),
  connectorCount: z.number().int().nonnegative().describe("当前未删除的枪口数量。"),
  createdAt: z.string().datetime().describe("创建时间。"),
  updatedAt: z.string().datetime().describe("最后更新时间。"),
});

export const chargingPointDetailResponseSchema = chargingPointSummaryResponseSchema
  .omit({ connectorCount: true })
  .extend({
    connectors: z.array(connectorResponseSchema),
  });

export const runtimeOperationResponseSchema = z.object({
  chargingPointId: z.string().uuid().describe("桩实例的 UUID 主键。"),
  status: z
    .enum(["stopped", "starting", "running"])
    .describe("当前服务进程中的运行状态。"),
  bootStatus: z
    .enum(["Accepted", "Pending"])
    .optional()
    .describe("最近一次 BootNotification 的结果。"),
  retryAfterSec: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Boot Pending 后建议等待的重试秒数。"),
});

export const runtimeSessionStatusSchema = z.enum([
  "online",
  "reconnecting",
  "offline",
]);

export const runtimeAvailabilityStatusSchema = z.enum([
  "available",
  "unavailable",
  "faulted",
]);

export const runtimeEvseStatusSchema = z.enum([
  "available",
  "occupied",
  "reserved",
  "unavailable",
  "faulted",
]);

export const connectorRuntimeStatusSchema = z.enum([
  "available",
  "occupied",
  "unavailable",
  "faulted",
]);

export const runtimeTransactionStatusSchema = z.enum([
  "starting",
  "active",
  "suspended",
  "ending",
  "ended",
  "rejected",
  "failed",
]);

export const runtimeSnapshotResponseSchema = z.object({
  chargingPointId: z.string().uuid().describe("桩实例的 UUID 主键。"),
  runtimeStatus: runtimeOperationResponseSchema.describe(
    "当前服务进程中的桩实例运行状态。",
  ),
  sessionStatus: z
    .object({
      currentStatus: runtimeSessionStatusSchema.describe("当前会话连接状态。"),
      occurredAt: z.string().datetime().describe("会话状态最后更新时间。"),
      connectionUrl: z.string().describe("桩实例实际连接的 CSMS WebSocket 地址。"),
      attempt: z.number().int().positive().optional().describe("当前重连尝试次数。"),
      reason: z
        .enum(["intentional", "unexpected_disconnect", "reconnect_exhausted"])
        .optional()
        .describe("会话离线原因。"),
    })
    .nullable()
    .describe("桩实例当前会话状态；没有运行态事件时为 null。"),
  chargingPointStatus: z
    .object({
      currentStatus: runtimeAvailabilityStatusSchema.describe("当前桩可用性状态。"),
      occurredAt: z.string().datetime().describe("桩可用性状态最后更新时间。"),
    })
    .nullable()
    .describe("OCPP 运行时中的整桩可用性状态。"),
  evseStatuses: z
    .array(
      z.object({
        evseId: z.number().int().positive().describe("EVSE 编号。"),
        currentStatus: runtimeEvseStatusSchema.describe("当前 EVSE 状态。"),
        occurredAt: z.string().datetime().describe("EVSE 状态最后更新时间。"),
      }),
    )
    .describe("按 EVSE 汇总的当前运行状态。"),
  connectorStatuses: z
    .array(
      z.object({
        evseId: z.number().int().positive().describe("枪口所属 EVSE 编号。"),
        connectorId: z.number().int().positive().describe("OCPP 枪口编号。"),
        currentStatus: connectorRuntimeStatusSchema.describe("当前枪口状态。"),
        occurredAt: z.string().datetime().describe("枪口状态最后更新时间。"),
      }),
    )
    .describe("按枪口汇总的当前运行状态。"),
  transactionStatuses: z
    .array(
      z.object({
        transactionId: z.string().describe("SparkBee 记录的交易 ID。"),
        evseId: z.number().int().positive().describe("交易所属 EVSE 编号。"),
        connectorId: z.number().int().positive().describe("交易所属 OCPP 枪口编号。"),
        currentStatus: runtimeTransactionStatusSchema.describe("当前交易状态。"),
        reason: z.string().optional().describe("交易状态原因。"),
        meterWh: z.number().int().nonnegative().optional().describe("最近电表读数，单位 Wh。"),
        sampledAt: z.string().datetime().optional().describe("最近电表采样时间。"),
        occurredAt: z.string().datetime().describe("交易状态最后更新时间。"),
      }),
    )
    .describe("按交易汇总的当前运行状态。"),
  lastHeartbeatAt: z
    .string()
    .datetime()
    .nullable()
    .describe("最近一次收到 Heartbeat 的时间。"),
  recentIssue: z
    .object({
      label: z.string().describe("最近运行异常摘要。"),
      tone: z.enum(["warning", "destructive"]).describe("异常严重程度。"),
      occurredAt: z.string().datetime().describe("异常发生时间。"),
    })
    .nullable()
    .describe("最近需要关注的运行异常。"),
});

export const chargingPointConnectorActionResponseSchema = z.object({
  chargingPointId: z.string().uuid().describe("桩实例的 UUID 主键。"),
  connectorId: z.string().uuid().describe("枪口的 UUID 主键。"),
  evseId: z.number().int().positive().describe("枪口在协议拓扑中所属的 EVSE 编号。"),
  protocolConnectorId: z
    .number()
    .int()
    .positive()
    .describe("枪口在 OCPP 协议中的 connectorId。"),
  plugState: z.enum(["plugged", "unplugged"]).describe("车辆接入状态。"),
  vehiclePresence: z.enum(["detected", "absent"]).describe("车辆检测状态。"),
  connectorStatus: connectorRuntimeStatusSchema.describe("枪口运行状态。"),
});

export const runtimeAuthorizeRequestSchema = z.object({
  idTag: trimmedRequiredIdTag.describe("用于 OCPP Authorize 的 idTag。"),
});

const runtimeConnectorOperationResponseBaseSchema = z.object({
  chargingPointId: z.string().uuid().describe("桩实例的 UUID 主键。"),
  connectorId: z.string().uuid().describe("枪口的 UUID 主键。"),
  evseId: z.number().int().positive().describe("枪口在协议拓扑中所属的 EVSE 编号。"),
  protocolConnectorId: z
    .number()
    .int()
    .positive()
    .describe("枪口在 OCPP 协议中的 connectorId。"),
});

const runtimeAuthorizeResponseBaseSchema = runtimeConnectorOperationResponseBaseSchema.extend({
  idTag: z.string().describe("本次鉴权使用的 idTag。"),
});

export const runtimeAuthorizeResponseSchema = z.discriminatedUnion("status", [
  runtimeAuthorizeResponseBaseSchema.extend({
    status: z.literal("accepted").describe("鉴权已通过。"),
  }),
  runtimeAuthorizeResponseBaseSchema.extend({
    status: z.literal("rejected").describe("鉴权被 CSMS 拒绝。"),
    reason: z.string().describe("鉴权被拒绝的原因。"),
    authorizationStatus: z.string().optional().describe("CSMS 返回的授权状态。"),
  }),
  runtimeAuthorizeResponseBaseSchema.extend({
    status: z.literal("failed").describe("鉴权请求发送或处理失败。"),
    errorCode: z.string().describe("鉴权失败错误码。"),
    errorMessage: z.string().describe("鉴权失败错误说明。"),
    shouldReconnect: z.boolean().describe("是否建议重连桩实例会话。"),
  }),
]);

export const runtimeStartTransactionRequestSchema = z.object({
  idTag: trimmedRequiredIdTag.describe("用于 OCPP StartTransaction 的 idTag。"),
  meterStartWh: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("开始交易时的电表读数，单位 Wh；未提供时由运行时使用默认值。"),
  reservationId: z
    .number()
    .int()
    .optional()
    .describe("OCPP 预约编号；没有预约时不提供。"),
});

export const runtimeStartTransactionResponseSchema = z.discriminatedUnion("status", [
  runtimeConnectorOperationResponseBaseSchema.extend({
    status: z.literal("accepted").describe("交易已开始。"),
    transactionId: z.string().describe("SparkBee 记录的交易 ID。"),
    idTag: z.string().describe("本次开始交易使用的 idTag。"),
  }),
  runtimeConnectorOperationResponseBaseSchema.extend({
    status: z.literal("rejected").describe("开始交易被拒绝。"),
    idTag: z.string().describe("本次开始交易使用的 idTag。"),
    reason: z.string().describe("开始交易被拒绝的原因。"),
    authorizationStatus: z.string().optional().describe("CSMS 返回的授权状态。"),
  }),
]);

export const runtimeTransactionStopReasonSchema = z.enum([
  "local",
  "remote",
  "unlock-command",
  "ev-disconnected",
  "deauthorized",
  "emergency-stop",
  "other",
]);

export const runtimeStopTransactionRequestSchema = z.object({
  transactionId: trimmedRequiredString.describe("要停止的 SparkBee 交易 ID。"),
  meterStopWh: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("停止交易时的电表读数，单位 Wh；未提供时使用交易最新电表值。"),
  reason: runtimeTransactionStopReasonSchema
    .optional()
    .describe("停止交易原因；未提供时 OCPP StopTransaction 不携带 reason。"),
  idTag: trimmedRequiredIdTag
    .optional()
    .describe("停止交易时可选上报的 idTag。"),
});

export const runtimeStopTransactionResponseSchema = z.discriminatedUnion("status", [
  runtimeConnectorOperationResponseBaseSchema.extend({
    status: z.literal("accepted").describe("交易已停止。"),
    transactionId: z.string().describe("SparkBee 记录的交易 ID。"),
    meterStopWh: z.number().int().nonnegative().describe("停止交易时的电表读数，单位 Wh。"),
    stoppedAt: z.string().datetime().describe("交易停止时间。"),
  }),
  runtimeConnectorOperationResponseBaseSchema.extend({
    status: z.literal("failed").describe("停止交易请求发送或处理失败。"),
    transactionId: z.string().describe("SparkBee 记录的交易 ID。"),
    errorCode: z.string().describe("停止交易失败错误码。"),
    errorMessage: z.string().describe("停止交易失败错误说明。"),
    shouldReconnect: z.boolean().describe("是否建议重连桩实例会话。"),
  }),
]);

export const listChargingPointsQuerySchema = paginationQuerySchema.extend({
  keyword: z
    .string()
    .trim()
    .optional()
    .describe("按桩名称、桩身份、vendor 或 model 模糊搜索的关键词。"),
});

export const listChargingPointsResponseSchema = paginatedResponseSchema(
  chargingPointSummaryResponseSchema,
);
