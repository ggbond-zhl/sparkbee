import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  listRuntimeLogsQuerySchema,
  listRuntimeLogsResponseSchema,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ValidationError } from "../../utils/errors";
import { RuntimeLogRepository } from "./runtimeLog.repo";

const routeDefinition = createRoute({
  method: "get",
  path: "/{id}/runtime-logs",
  tags: ["RuntimeLog"],
  summary: "查询桩实例运行日志",
  description: "按时间、级别、日志类型或 operationId 查询桩实例最近 7 天的持久化运行日志。",
  request: {
    params: z.object({ id: z.string().uuid().describe("桩实例的 UUID 主键。") }),
    query: listRuntimeLogsQuerySchema,
  },
  responses: {
    200: {
      description: "运行日志分页结果。",
      content: { "application/json": { schema: listRuntimeLogsResponseSchema } },
    },
    400: {
      description: "请求参数校验失败。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

export function createRuntimeLogRoute(database: ServerDatabase) {
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
  const repository = new RuntimeLogRepository(database);
  route.openapi(routeDefinition, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await repository.list(id, context.req.valid("query")), 200);
  });
  return route;
}
