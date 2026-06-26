import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  chargingPointDetailResponseSchema,
  connectorResponseSchema,
  createChargingPointRequestSchema,
  createConnectorRequestSchema,
  listChargingPointsQuerySchema,
  listChargingPointsResponseSchema,
  updateChargingPointRequestSchema,
  updateConnectorRequestSchema,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ValidationError } from "../../utils/errors";
import { ChargingPointRepository } from "./chargingPoint.repo";

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

const connectorConflictResponse = {
  description: "枪口编号在所属桩实例内冲突。",
  content: jsonContent(apiErrorResponseSchema),
};

const chargingPointIdParamSchema = z.object({
  id: z.string().uuid().describe("桩实例的 UUID 主键。"),
});

const chargingPointConnectorParamSchema = z.object({
  id: z.string().uuid().describe("所属桩实例的 UUID 主键。"),
});

const connectorIdParamSchema = chargingPointConnectorParamSchema.extend({
  connectorId: z.string().uuid().describe("枪口的 UUID 主键。"),
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

const listConnectorsRoute = createRoute({
  method: "get",
  path: "/{id}/connectors",
  tags: ["Connector"],
  summary: "查询枪口列表",
  description: "查询指定桩实例下当前未删除的枪口，按 sortOrder 和创建时间排序。",
  request: {
    params: chargingPointConnectorParamSchema,
  },
  responses: {
    200: {
      description: "枪口列表。",
      content: jsonContent(z.array(connectorResponseSchema)),
    },
    400: validationErrorResponse,
    404: notFoundResponse,
  },
});

const createConnectorRouteDefinition = createRoute({
  method: "post",
  path: "/{id}/connectors",
  tags: ["Connector"],
  summary: "创建枪口",
  description: "为指定桩实例创建一个枪口配置；EVSE 编号和 connectorId 在桩实例内必须唯一。",
  request: {
    params: chargingPointConnectorParamSchema,
    body: {
      required: true,
      content: jsonContent(createConnectorRequestSchema),
    },
  },
  responses: {
    201: {
      description: "已创建的枪口。",
      content: jsonContent(connectorResponseSchema),
    },
    400: validationErrorResponse,
    404: notFoundResponse,
    409: connectorConflictResponse,
  },
});

const getConnectorRoute = createRoute({
  method: "get",
  path: "/{id}/connectors/{connectorId}",
  tags: ["Connector"],
  summary: "查看枪口详情",
  description: "读取指定桩实例下的单个未删除枪口。",
  request: {
    params: connectorIdParamSchema,
  },
  responses: {
    200: {
      description: "枪口详情。",
      content: jsonContent(connectorResponseSchema),
    },
    400: validationErrorResponse,
    404: notFoundResponse,
  },
});

const updateConnectorRouteDefinition = createRoute({
  method: "patch",
  path: "/{id}/connectors/{connectorId}",
  tags: ["Connector"],
  summary: "更新枪口",
  description: "更新枪口的可编辑配置字段，不修改主键、所属桩实例和 sortOrder。",
  request: {
    params: connectorIdParamSchema,
    body: {
      required: true,
      content: jsonContent(updateConnectorRequestSchema),
    },
  },
  responses: {
    200: {
      description: "更新后的枪口。",
      content: jsonContent(connectorResponseSchema),
    },
    400: validationErrorResponse,
    404: notFoundResponse,
    409: connectorConflictResponse,
  },
});

const deleteConnectorRoute = createRoute({
  method: "delete",
  path: "/{id}/connectors/{connectorId}",
  tags: ["Connector"],
  summary: "删除枪口",
  description: "软删除指定桩实例下的枪口；第一阶段允许删除最后一个枪口。",
  request: {
    params: connectorIdParamSchema,
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
  const repository = new ChargingPointRepository(database);

  route.openapi(createChargingPointRouteDefinition, async (context) => {
    const input = context.req.valid("json");
    const chargingPoint = await repository.create(input);
    return context.json(chargingPoint, 201);
  });

  route.openapi(listChargingPointsRoute, async (context) => {
    const query = context.req.valid("query");
    return context.json(await repository.list(query), 200);
  });

  route.openapi(getChargingPointRoute, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await repository.getById(id), 200);
  });

  route.openapi(updateChargingPointRouteDefinition, async (context) => {
    const { id } = context.req.valid("param");
    const input = context.req.valid("json");
    return context.json(await repository.update(id, input), 200);
  });

  route.openapi(deleteChargingPointRoute, async (context) => {
    const { id } = context.req.valid("param");
    await repository.softDelete(id);
    return context.body(null, 204);
  });

  route.openapi(createConnectorRouteDefinition, async (context) => {
    const { id: chargingPointId } = context.req.valid("param");
    const input = context.req.valid("json");
    const connector = await repository.createConnector(chargingPointId, input);
    return context.json(connector, 201);
  });

  route.openapi(listConnectorsRoute, async (context) => {
    const { id: chargingPointId } = context.req.valid("param");
    return context.json(await repository.listConnectors(chargingPointId), 200);
  });

  route.openapi(getConnectorRoute, async (context) => {
    const { id: chargingPointId, connectorId } = context.req.valid("param");
    return context.json(await repository.getConnector(chargingPointId, connectorId), 200);
  });

  route.openapi(updateConnectorRouteDefinition, async (context) => {
    const { id: chargingPointId, connectorId } = context.req.valid("param");
    const input = context.req.valid("json");
    return context.json(
      await repository.updateConnector(chargingPointId, connectorId, input),
      200,
    );
  });

  route.openapi(deleteConnectorRoute, async (context) => {
    const { id: chargingPointId, connectorId } = context.req.valid("param");
    await repository.softDeleteConnector(chargingPointId, connectorId);
    return context.body(null, 204);
  });

  return route;
}
