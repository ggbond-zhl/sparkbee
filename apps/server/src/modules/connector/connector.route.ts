import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  connectorResponseSchema,
  createConnectorRequestSchema,
  updateConnectorRequestSchema,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import { ValidationError } from "../../utils/errors";
import { ConnectorRepository } from "./connector.repo";

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

const chargingPointConnectorParamSchema = z.object({
  id: z.string().uuid().describe("所属桩实例的 UUID 主键。"),
});

const connectorIdParamSchema = chargingPointConnectorParamSchema.extend({
  connectorId: z.string().uuid().describe("枪口的 UUID 主键。"),
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

export function createConnectorRoute(database: ServerDatabase) {
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
  const repository = new ConnectorRepository(database);

  route.openapi(createConnectorRouteDefinition, async (context) => {
    const { id: chargingPointId } = context.req.valid("param");
    const input = context.req.valid("json");
    const connector = await repository.create(chargingPointId, input);
    return context.json(connector, 201);
  });

  route.openapi(listConnectorsRoute, async (context) => {
    const { id: chargingPointId } = context.req.valid("param");
    return context.json(await repository.list(chargingPointId), 200);
  });

  route.openapi(getConnectorRoute, async (context) => {
    const { id: chargingPointId, connectorId } = context.req.valid("param");
    return context.json(await repository.get(chargingPointId, connectorId), 200);
  });

  route.openapi(updateConnectorRouteDefinition, async (context) => {
    const { id: chargingPointId, connectorId } = context.req.valid("param");
    const input = context.req.valid("json");
    return context.json(
      await repository.update(chargingPointId, connectorId, input),
      200,
    );
  });

  route.openapi(deleteConnectorRoute, async (context) => {
    const { id: chargingPointId, connectorId } = context.req.valid("param");
    await repository.softDelete(chargingPointId, connectorId);
    return context.body(null, 204);
  });

  return route;
}
