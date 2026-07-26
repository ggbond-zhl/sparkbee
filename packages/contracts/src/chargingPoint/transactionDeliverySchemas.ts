import { z } from "zod";

import {
  transactionDeliveryStatusSchema,
  transactionDeliverySummarySchema,
} from "./schemas";

export const transactionDeliveryMessageTypeSchema = z
  .enum(["start", "meter_value", "stop"])
  .describe("交易交付消息类型。");

export const transactionDeliveryItemSchema = z.object({
  id: z.string().uuid().describe("交易交付记录的 UUID 主键。"),
  messageId: z.string().uuid().describe("OCPP CALL 使用的稳定 uniqueId。"),
  transactionId: z.string().min(1).describe("SparkBee 本地交易 ID。"),
  ocppTransactionId: z.number().int().nullable().describe("CSMS 分配的 OCPP transactionId；尚未取得时为 null，最终无法取得时为 -1。"),
  deliverySequence: z.string().regex(/^\d+$/).describe("单桩交易消息生成顺序，以十进制字符串返回。"),
  messageType: transactionDeliveryMessageTypeSchema,
  status: transactionDeliveryStatusSchema,
  attemptCount: z.number().int().nonnegative().describe("已经开始的交付尝试总数。"),
  nextAttemptAt: z.iso.datetime().nullable().describe("下次允许重试的时间；当前无需等待时为 null。"),
  occurredAt: z.iso.datetime().describe("交易消息对应业务事实的发生时间。"),
  lastError: z
    .object({
      code: z.string().describe("最近交付错误码。"),
      message: z.string().describe("最近交付错误说明。"),
    })
    .nullable()
    .describe("最近交付错误；没有失败时为 null。"),
});

export const listTransactionDeliveriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(200)
    .describe("单次返回的交易交付记录数量，最大 200。"),
  before: z.string().regex(/^\d+$/).optional()
    .describe("继续查询更早交易交付记录的序号游标。"),
  status: transactionDeliveryStatusSchema.optional()
    .describe("按交付状态过滤。"),
  messageType: transactionDeliveryMessageTypeSchema.optional()
    .describe("按交易消息类型过滤。"),
});

export const listTransactionDeliveriesResponseSchema = z.object({
  items: transactionDeliveryItemSchema.array(),
  previousCursor: z.string().regex(/^\d+$/).nullable()
    .describe("继续查询更早交易交付记录的序号游标。"),
});

export type TransactionDeliveryMessageType = z.infer<
  typeof transactionDeliveryMessageTypeSchema
>;
export type TransactionDeliverySummary = z.infer<
  typeof transactionDeliverySummarySchema
>;
export type TransactionDeliveryItem = z.infer<
  typeof transactionDeliveryItemSchema
>;
export type ListTransactionDeliveriesQuery = z.infer<
  typeof listTransactionDeliveriesQuerySchema
>;
export type ListTransactionDeliveriesResponse = z.infer<
  typeof listTransactionDeliveriesResponseSchema
>;
