import { z } from "zod";

import { paginatedResponseSchema, paginationQuerySchema } from "../pagination";

export const chargingPointProtocolSchema = z.enum(["OCPP16J"]);
export const connectorFormatSchema = z.enum(["socket", "cable", "unknown"]);
export const connectorPowerTypeSchema = z.enum(["ac", "dc", "unknown"]);

const trimmedRequiredString = z.string().trim().min(1);
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
const nonNegativeIntegerSchema = z.number().int().nonnegative().nullable();

export const createChargingPointRequestSchema = z.object({
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
  maxVoltage: nonNegativeIntegerSchema.optional().describe("枪口额定最大电压，单位 V。"),
  maxCurrent: nonNegativeIntegerSchema.optional().describe("枪口额定最大电流，单位 A。"),
  maxPower: nonNegativeIntegerSchema.optional().describe("枪口额定最大功率，单位 W。"),
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
  maxVoltage: z.number().int().nonnegative().nullable().describe("枪口额定最大电压，单位 V。"),
  maxCurrent: z.number().int().nonnegative().nullable().describe("枪口额定最大电流，单位 A。"),
  maxPower: z.number().int().nonnegative().nullable().describe("枪口额定最大功率，单位 W。"),
  sortOrder: z.number().int().positive().describe("枪口在所属桩实例内的展示顺序。"),
  createdAt: z.string().datetime().describe("创建时间。"),
  updatedAt: z.string().datetime().describe("最后更新时间。"),
});

export const chargingPointSummaryResponseSchema = z.object({
  id: z.string().uuid().describe("桩实例的 UUID 主键。"),
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

export const chargingPointOperationResponseSchema = z.object({
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

export const listChargingPointsQuerySchema = paginationQuerySchema.extend({
  keyword: z
    .string()
    .trim()
    .optional()
    .describe("按 identity、vendor 或 model 模糊搜索的关键词。"),
});

export const listChargingPointsResponseSchema = paginatedResponseSchema(
  chargingPointSummaryResponseSchema,
);
