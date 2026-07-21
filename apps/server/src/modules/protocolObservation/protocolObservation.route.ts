import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  listHistoricalObservationEventsQuerySchema,
  listHistoricalObservationEventsResponseSchema,
  listProtocolMessagesQuerySchema,
  listProtocolMessagesResponseSchema,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ValidationError } from "../../utils/errors";
import {
  HistoricalObservationEventRepository,
  ProtocolMessageRepository,
} from "./protocolObservation.repo";

const listProtocolMessagesRoute = createRoute({
  method: "get",
  path: "/{id}/protocol-messages",
  tags: ["ProtocolObservation"],
  summary: "查询桩实例协议报文",
  description: "按时间、方向或 OCPP action 查询桩实例最近 7 天的历史协议报文。",
  request: {
    params: z.object({ id: z.string().uuid().describe("桩实例的 UUID 主键。") }),
    query: listProtocolMessagesQuerySchema,
  },
  responses: {
    200: {
      description: "协议报文游标分页结果。",
      content: { "application/json": { schema: listProtocolMessagesResponseSchema } },
    },
    400: {
      description: "请求参数校验失败。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

const listObservationEventsRoute = createRoute({
  method: "get",
  path: "/{id}/protocol-events",
  tags: ["ProtocolObservation"],
  summary: "查询桩实例协议事件",
  description: "按时间或事件类型查询桩实例最近 7 天的历史协议事件。",
  request: {
    params: z.object({ id: z.string().uuid().describe("桩实例的 UUID 主键。") }),
    query: listHistoricalObservationEventsQuerySchema,
  },
  responses: {
    200: {
      description: "协议事件游标分页结果。",
      content: {
        "application/json": {
          schema: listHistoricalObservationEventsResponseSchema,
        },
      },
    },
    400: {
      description: "请求参数校验失败。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

export function createProtocolObservationRoute(database: ServerDatabase) {
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
  const repository = new ProtocolMessageRepository(database);
  const eventRepository = new HistoricalObservationEventRepository(database);

  route.openapi(listProtocolMessagesRoute, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await repository.list(id, context.req.valid("query")), 200);
  });

  route.openapi(listObservationEventsRoute, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await eventRepository.list(id, context.req.valid("query")), 200);
  });

  return route;
}
