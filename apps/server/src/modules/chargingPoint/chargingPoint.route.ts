import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  chargingPointDetailResponseSchema,
  createChargingPointRequestSchema,
  listChargingPointsQuerySchema,
  listChargingPointsResponseSchema,
  updateChargingPointRequestSchema,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ValidationError } from "../../utils/errors";
import { createChargingPointService } from "./chargingPoint.service";

const jsonContent = <TSchema extends z.ZodType>(schema: TSchema) => ({
  "application/json": { schema },
});

const validationErrorResponse = {
  description: "请求参数校验失败。",
  content: jsonContent(apiErrorResponseSchema),
};

const notFoundResponse = {
  description: "请求的资源不存在或已删除。",
  content: jsonContent(apiErrorResponseSchema),
};

const chargingPointIdParamSchema = z.object({
  id: z.string().uuid().describe("桩实例的 UUID 主键。"),
});

const listChargingPointsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["ChargingPoint"],
  summary: "查询桩实例列表",
  description: "分页查询未删除的桩实例，可按 identity、vendor 或 model 关键词过滤。",
  request: {
    query: listChargingPointsQuerySchema,
  },
  responses: {
    200: {
      description: "桩实例分页结果。",
      content: jsonContent(listChargingPointsResponseSchema),
    },
    400: validationErrorResponse,
  },
});

const createChargingPointRouteDefinition = createRoute({
  method: "post",
  path: "/",
  tags: ["ChargingPoint"],
  summary: "创建桩实例",
  description: "创建一个可长期存在的虚拟充电桩基础配置；第一阶段允许没有枪口。",
  request: {
    body: {
      required: true,
      content: jsonContent(createChargingPointRequestSchema),
    },
  },
  responses: {
    201: {
      description: "已创建的桩实例详情。",
      content: jsonContent(chargingPointDetailResponseSchema),
    },
    400: validationErrorResponse,
  },
});

const getChargingPointRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["ChargingPoint"],
  summary: "查看桩实例详情",
  description: "读取一个未删除桩实例及其当前未删除枪口。",
  request: {
    params: chargingPointIdParamSchema,
  },
  responses: {
    200: {
      description: "桩实例详情。",
      content: jsonContent(chargingPointDetailResponseSchema),
    },
    400: validationErrorResponse,
    404: notFoundResponse,
  },
});

const updateChargingPointRouteDefinition = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["ChargingPoint"],
  summary: "更新桩实例",
  description: "更新桩实例的可编辑基础字段，不修改主键和审计字段。",
  request: {
    params: chargingPointIdParamSchema,
    body: {
      required: true,
      content: jsonContent(updateChargingPointRequestSchema),
    },
  },
  responses: {
    200: {
      description: "更新后的桩实例详情。",
      content: jsonContent(chargingPointDetailResponseSchema),
    },
    400: validationErrorResponse,
    404: notFoundResponse,
  },
});

const deleteChargingPointRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["ChargingPoint"],
  summary: "删除桩实例",
  description: "软删除桩实例，并软删除其下当前未删除的枪口。",
  request: {
    params: chargingPointIdParamSchema,
  },
  responses: {
    204: {
      description: "删除成功，无响应体。",
    },
    400: validationErrorResponse,
    404: notFoundResponse,
  },
});

export function createChargingPointRoute(database: ServerDatabase) {
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
  const service = createChargingPointService(database);

  route.openapi(createChargingPointRouteDefinition, async (context) => {
    const input = context.req.valid("json");
    const chargingPoint = await service.create(input);
    return context.json(chargingPoint, 201);
  });

  route.openapi(listChargingPointsRoute, async (context) => {
    const query = context.req.valid("query");
    return context.json(await service.list(query), 200);
  });

  route.openapi(getChargingPointRoute, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await service.getById(id), 200);
  });

  route.openapi(updateChargingPointRouteDefinition, async (context) => {
    const { id } = context.req.valid("param");
    const input = context.req.valid("json");
    return context.json(await service.update(id, input), 200);
  });

  route.openapi(deleteChargingPointRoute, async (context) => {
    const { id } = context.req.valid("param");
    await service.softDelete(id);
    return context.body(null, 204);
  });

  return route;
}
