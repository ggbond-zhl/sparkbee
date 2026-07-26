import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  listTransactionDeliveriesQuerySchema,
  listTransactionDeliveriesResponseSchema,
  type ListTransactionDeliveriesResponse,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ValidationError } from "../../utils/errors";
import {
  TransactionDeliveryRepository,
  type TransactionDeliveryRecord,
} from "./transactionDelivery.repo";

const listTransactionDeliveriesRoute = createRoute({
  method: "get",
  path: "/{id}/transaction-deliveries",
  tags: ["TransactionDelivery"],
  summary: "查询交易交付记录",
  description:
    "按交付状态或消息类型倒序查询桩实例的 StartTransaction、MeterValues 和 StopTransaction 持久交付记录。响应不包含 idTag 或完整 OCPP payload。",
  request: {
    params: z.object({ id: z.string().uuid().describe("桩实例的 UUID 主键。") }),
    query: listTransactionDeliveriesQuerySchema,
  },
  responses: {
    200: {
      description: "交易交付记录的游标分页结果。",
      content: {
        "application/json": { schema: listTransactionDeliveriesResponseSchema },
      },
    },
    400: {
      description: "请求参数校验失败。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

export function createTransactionDeliveryRoute(database: ServerDatabase) {
  const route = new OpenAPIHono({
    defaultHook: (result) => {
      if (!result.success) {
        throw new ValidationError(result.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })));
      }
    },
  });
  const repository = new TransactionDeliveryRepository(database);

  route.openapi(listTransactionDeliveriesRoute, async (context) => {
    const { id } = context.req.valid("param");
    const query = context.req.valid("query");
    const page = await repository.listPage({
      chargingPointId: id,
      limit: query.limit,
      ...(query.before === undefined ? {} : { before: BigInt(query.before) }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.messageType === undefined
        ? {}
        : { messageType: query.messageType }),
    });
    return context.json({
      items: page.items.map(toResponseItem),
      previousCursor: page.previousCursor?.toString() ?? null,
    } satisfies ListTransactionDeliveriesResponse, 200);
  });

  return route;
}

function toResponseItem(
  record: TransactionDeliveryRecord,
): ListTransactionDeliveriesResponse["items"][number] {
  return {
    id: record.id,
    messageId: record.messageId,
    transactionId: record.transactionId,
    ocppTransactionId: record.ocppTransactionId,
    deliverySequence: record.deliverySequence.toString(),
    messageType: record.messageType,
    status: record.status,
    attemptCount: record.attemptCount,
    nextAttemptAt: record.nextAttemptAt?.toISOString() ?? null,
    occurredAt: record.occurredAt.toISOString(),
    lastError: record.lastErrorCode === null || record.lastErrorMessage === null
      ? null
      : { code: record.lastErrorCode, message: record.lastErrorMessage },
  };
}
