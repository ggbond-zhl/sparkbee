import { z } from "zod";

export const runtimeLogLevelSchema = z.enum(["info", "warn", "error"])
  .describe("运行日志级别。");

export const runtimeLogSchema = z.object({
  id: z.string().describe("运行日志唯一标识。"),
  sequence: z.number().int().nonnegative().describe("桩实例进程内的日志序号。"),
  chargingPointId: z.string().uuid().describe("所属桩实例的 UUID 主键。"),
  occurredAt: z.iso.datetime().describe("运行日志发生时间。"),
  level: runtimeLogLevelSchema,
  code: z.string().nullable().describe("结构化运行日志类型编码。"),
  message: z.string().describe("运行日志说明。"),
  context: z.record(z.string(), z.unknown()).nullable().describe("脱敏后的结构化上下文。"),
});

export const listRuntimeLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(200)
    .describe("单次返回数量，最大 200。"),
  before: z.string().optional().describe("向更早记录翻页的游标。"),
  after: z.string().optional().describe("短轮询新增记录的游标。"),
  level: runtimeLogLevelSchema.optional().describe("按运行日志级别过滤。"),
  code: z.string().trim().min(1).optional().describe("按运行日志类型编码精确过滤。"),
  operationId: z.string().trim().min(1).optional().describe("按 operationId 精确过滤。"),
  from: z.iso.datetime().optional().describe("发生时间范围起点。"),
  to: z.iso.datetime().optional().describe("发生时间范围终点。"),
}).refine((value) => value.before === undefined || value.after === undefined, {
  message: "before 和 after 不能同时提供",
});

export const listRuntimeLogsResponseSchema = z.object({
  items: runtimeLogSchema.array(),
  previousCursor: z.string().nullable().describe("继续查询更早记录的游标。"),
  latestCursor: z.string().nullable().describe("继续短轮询新增记录的游标。"),
});

export type RuntimeLog = z.infer<typeof runtimeLogSchema>;
export type ListRuntimeLogsQuery = z.infer<typeof listRuntimeLogsQuerySchema>;
export type ListRuntimeLogsResponse = z.infer<typeof listRuntimeLogsResponseSchema>;
