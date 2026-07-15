import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  listActorLogsQuerySchema,
  listActorLogsResponseSchema,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ValidationError } from "../../utils/errors";
import { ActorLogRepository } from "./actorLog.repo";

const routeDefinition = createRoute({
  method: "get",
  path: "/{id}/actor-logs",
  tags: ["ActorLog"],
  summary: "查询桩实例 Actor 日志",
  description: "按时间、级别、日志类型或 operationId 查询桩实例最近 7 天的持久化 Actor 日志。",
  request: {
    params: z.object({ id: z.string().uuid().describe("桩实例的 UUID 主键。") }),
    query: listActorLogsQuerySchema,
  },
  responses: {
    200: {
      description: "Actor 日志分页结果。",
      content: { "application/json": { schema: listActorLogsResponseSchema } },
    },
    400: {
      description: "请求参数校验失败。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

export function createActorLogRoute(database: ServerDatabase) {
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
  const repository = new ActorLogRepository(database);
  route.openapi(routeDefinition, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await repository.list(id, context.req.valid("query")), 200);
  });
  return route;
}
