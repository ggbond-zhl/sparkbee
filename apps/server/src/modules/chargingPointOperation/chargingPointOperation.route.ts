import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  chargingPointOperationResponseSchema,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ValidationError } from "../../utils/errors";
import {
  createChargingPointOperationService,
  type ChargingPointOperationServiceDependencies,
} from "./chargingPointOperation.service";

export type ChargingPointOperationRouteDependencies =
  ChargingPointOperationServiceDependencies;

const jsonContent = <TSchema extends z.ZodType>(schema: TSchema) => ({
  "application/json": { schema },
});

const validationErrorResponse = {
  description: "请求参数校验失败。",
  content: jsonContent(apiErrorResponseSchema),
};

const notFoundResponse = {
  description: "请求的桩实例不存在或已删除。",
  content: jsonContent(apiErrorResponseSchema),
};

const chargingPointIdParamSchema = z.object({
  id: z.string().uuid().describe("桩实例的 UUID 主键。"),
});

const operationSuccessResponse = (description: string) => ({
  description,
  content: jsonContent(chargingPointOperationResponseSchema),
});

const startChargingPointRoute = createRoute({
  method: "post",
  path: "/{id}/start",
  tags: ["ChargingPointOperation"],
  summary: "启动桩实例",
  description: "启动当前服务进程中的桩实例 Actor；重复启动时返回已有 Actor 的运行状态。",
  request: {
    params: chargingPointIdParamSchema,
  },
  responses: {
    200: operationSuccessResponse("桩实例启动结果或已有运行状态。"),
    400: validationErrorResponse,
    404: notFoundResponse,
    409: {
      description: "桩实例缺少运行所需配置。",
      content: jsonContent(apiErrorResponseSchema),
    },
    502: {
      description: "桩实例 Actor 启动失败。",
      content: jsonContent(apiErrorResponseSchema),
    },
  },
});

const stopChargingPointRoute = createRoute({
  method: "post",
  path: "/{id}/stop",
  tags: ["ChargingPointOperation"],
  summary: "停止桩实例",
  description: "停止当前服务进程中的桩实例 Actor；未运行时直接返回 stopped。",
  request: {
    params: chargingPointIdParamSchema,
  },
  responses: {
    200: operationSuccessResponse("桩实例停止后的运行状态。"),
    400: validationErrorResponse,
    404: notFoundResponse,
    502: {
      description: "桩实例 Actor 停止失败。",
      content: jsonContent(apiErrorResponseSchema),
    },
  },
});

const getChargingPointStatusRoute = createRoute({
  method: "get",
  path: "/{id}/status",
  tags: ["ChargingPointOperation"],
  summary: "查询桩实例运行状态",
  description: "查询当前服务进程中桩实例 Actor 的运行状态；没有 Actor 时返回 stopped。",
  request: {
    params: chargingPointIdParamSchema,
  },
  responses: {
    200: operationSuccessResponse("桩实例当前运行状态。"),
    400: validationErrorResponse,
    404: notFoundResponse,
  },
});

export function createChargingPointOperationRoute(
  database: ServerDatabase,
  dependencies: ChargingPointOperationRouteDependencies = {},
) {
  const route = new OpenAPIHono({
    defaultHook: (result) => {
      if (!result.success) {
        throw new ValidationError(
          result.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        );
      }
    },
  });
  const service = createChargingPointOperationService(database, dependencies);

  route.openapi(startChargingPointRoute, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await service.start(id), 200);
  });

  route.openapi(stopChargingPointRoute, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await service.stop(id), 200);
  });

  route.openapi(getChargingPointStatusRoute, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await service.getStatus(id), 200);
  });

  return route;
}
