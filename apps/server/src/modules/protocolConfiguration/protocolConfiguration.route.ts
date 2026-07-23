import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  protocolConfigurationListResponseSchema,
  updateProtocolConfigurationRequestSchema,
  updateProtocolConfigurationResponseSchema,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import type { ChargingPointActorHost } from "../../lib/chargingPointActorHost";
import { AppError, ValidationError } from "../../utils/errors";
import { ProtocolConfigurationRepository } from "./protocolConfiguration.repo";

const listProtocolConfigurationRoute = createRoute({
  method: "get",
  path: "/{id}/configuration",
  tags: ["ProtocolConfiguration"],
  summary: "查询协议配置目录",
  description: "查询桩实例当前协议版本下的完整内置协议配置目录。",
  request: {
    params: z.object({ id: z.string().uuid().describe("桩实例的 UUID 主键。") }),
  },
  responses: {
    200: {
      description: "协议配置目录。",
      content: {
        "application/json": { schema: protocolConfigurationListResponseSchema },
      },
    },
    400: {
      description: "请求参数校验失败。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    404: {
      description: "桩实例不存在或已删除。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

const updateProtocolConfigurationRoute = createRoute({
  method: "patch",
  path: "/{id}/configuration/{key}",
  tags: ["ProtocolConfiguration"],
  summary: "修改协议配置项",
  description: "按当前版本修改单个可写协议配置项；运行中的桩实例由 Actor 串行写入。",
  request: {
    params: z.object({
      id: z.string().uuid().describe("桩实例的 UUID 主键。"),
      key: z.string().min(1).describe("协议配置项键名。"),
    }),
    body: {
      required: true,
      content: {
        "application/json": { schema: updateProtocolConfigurationRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "协议配置项修改成功。",
      content: {
        "application/json": { schema: updateProtocolConfigurationResponseSchema },
      },
    },
    400: {
      description: "请求参数校验失败。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    404: {
      description: "桩实例或协议配置项不存在。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    409: {
      description: "配置版本或桩实例生命周期发生冲突。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    422: {
      description: "配置项只读或配置值不合法。",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

export function createProtocolConfigurationRoute(
  database: ServerDatabase,
  dependencies: { chargingPointActorHost?: ChargingPointActorHost } = {},
) {
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
  const repository = new ProtocolConfigurationRepository(database);

  route.openapi(listProtocolConfigurationRoute, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await repository.list(id), 200);
  });
  route.openapi(updateProtocolConfigurationRoute, async (context) => {
    const { id, key } = context.req.valid("param");
    const input = context.req.valid("json");
    const actor = dependencies.chargingPointActorHost?.get(id);
    if (actor === undefined) {
      const result = await repository.changeWhileStopped(id, key, input);
      await dependencies.chargingPointActorHost?.publishActorEvent({
        id: crypto.randomUUID(),
        sequence: 0,
        type: "configuration.changed",
        chargingPointId: id,
        protocol: result.protocol,
        resource: { scope: "configuration", key: result.entry.key },
        occurredAt: result.entry.updatedAt.toISOString(),
        value: result.entry.value,
        version: result.entry.version,
        lastModifiedBy: result.entry.lastModifiedBy,
        pendingRestart: result.entry.pendingRestart,
      });
      return context.json({
        status: result.status,
        item: repository.describeEntry(result.entry),
      }, 200);
    }

    let result;
    try {
      result = await actor.changeConfiguration({ key, ...input });
    } catch (error) {
      if (actor.status === "stopped") {
        throw new AppError(
          409,
          "CHARGING_POINT_LIFECYCLE_CONFLICT",
          "Charging point lifecycle changed",
        );
      }
      throw error;
    }
    if (result.status === "rejected") {
      throw new AppError(
        result.reason === "not-supported" ? 404 : 422,
        result.reason === "not-supported"
          ? "PROTOCOL_CONFIGURATION_NOT_FOUND"
          : "PROTOCOL_CONFIGURATION_INVALID_VALUE",
        result.reason === "not-supported"
          ? "Protocol configuration not found"
          : "Protocol configuration value is invalid",
      );
    }
    return context.json({
      status: result.status,
      item: repository.describeEntry(result.entry),
    }, 200);
  });
  return route;
}
