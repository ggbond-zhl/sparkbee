import { z } from "zod";

export const actorLogLevelSchema = z.enum(["info", "warn", "error"])
  .describe("Actor 日志级别。");

export const actorLogSchema = z.object({
  id: z.string().describe("Actor 日志唯一标识。"),
  sequence: z.number().int().nonnegative().describe("Actor 实例内的日志序号。"),
  chargingPointId: z.string().uuid().describe("所属桩实例的 UUID 主键。"),
  occurredAt: z.iso.datetime().describe("Actor 日志发生时间。"),
  level: actorLogLevelSchema,
  code: z.string().nullable().describe("结构化 Actor 日志类型编码。"),
  message: z.string().describe("Actor 日志说明。"),
  context: z.record(z.string(), z.unknown()).nullable().describe("结构化诊断上下文。"),
});

export const listActorLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(200)
    .describe("单次返回数量，最大 200。"),
  before: z.string().optional().describe("向更早记录翻页的游标。"),
  after: z.string().optional().describe("短轮询新增记录的游标。"),
  level: actorLogLevelSchema.optional().describe("按 Actor 日志级别过滤。"),
  code: z.string().trim().min(1).optional().describe("按 Actor 日志类型编码精确过滤。"),
  operationId: z.string().trim().min(1).optional().describe("按 operationId 精确过滤。"),
  from: z.iso.datetime().optional().describe("发生时间范围起点。"),
  to: z.iso.datetime().optional().describe("发生时间范围终点。"),
}).refine((value) => value.before === undefined || value.after === undefined, {
  message: "before 和 after 不能同时提供",
});

export const listActorLogsResponseSchema = z.object({
  items: actorLogSchema.array(),
  previousCursor: z.string().nullable().describe("继续查询更早记录的游标。"),
  latestCursor: z.string().nullable().describe("继续短轮询新增记录的游标。"),
});

export type ActorLog = z.infer<typeof actorLogSchema>;
export type ListActorLogsQuery = z.infer<typeof listActorLogsQuerySchema>;
export type ListActorLogsResponse = z.infer<typeof listActorLogsResponseSchema>;
