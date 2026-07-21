import { z } from "zod";

import {
  protocolEventSchema,
  protocolEventTypeSchema,
  protocolMessageEventSchema,
} from "./eventSchemas";

export const listProtocolMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(200)
    .describe("单次返回的协议报文数量，最大 200。"),
  before: z.string().optional().describe("继续查询更早协议报文的游标。"),
  direction: z.enum(["sent", "received"]).optional()
    .describe("按协议报文方向过滤。"),
  action: z.string().trim().min(1).optional()
    .describe("按 OCPP action 精确过滤。"),
  from: z.iso.datetime().optional().describe("协议报文发生时间范围起点。"),
  to: z.iso.datetime().optional().describe("协议报文发生时间范围终点。"),
});

export const listProtocolMessagesResponseSchema = z.object({
  items: protocolMessageEventSchema.array(),
  previousCursor: z.string().nullable().describe("继续查询更早协议报文的游标。"),
});

export type ListProtocolMessagesQuery = z.infer<
  typeof listProtocolMessagesQuerySchema
>;
export type ListProtocolMessagesResponse = z.infer<
  typeof listProtocolMessagesResponseSchema
>;

export const listProtocolEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(200)
    .describe("单次返回的协议事件数量，最大 200。"),
  before: z.string().optional().describe("继续查询更早协议事件的游标。"),
  eventType: protocolEventTypeSchema.optional().describe("按协议事件类型过滤。"),
  from: z.iso.datetime().optional().describe("协议事件发生时间范围起点。"),
  to: z.iso.datetime().optional().describe("协议事件发生时间范围终点。"),
});

export const listProtocolEventsResponseSchema = z.object({
  items: protocolEventSchema.array(),
  previousCursor: z.string().nullable().describe("继续查询更早协议事件的游标。"),
});

export type ListProtocolEventsQuery = z.infer<typeof listProtocolEventsQuerySchema>;
export type ListProtocolEventsResponse = z.infer<
  typeof listProtocolEventsResponseSchema
>;

export const listHistoricalObservationEventsQuerySchema =
  listProtocolEventsQuerySchema;
export const listHistoricalObservationEventsResponseSchema =
  listProtocolEventsResponseSchema;
export type ListHistoricalObservationEventsQuery = ListProtocolEventsQuery;
