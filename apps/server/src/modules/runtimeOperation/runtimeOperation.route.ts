import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  apiErrorResponseSchema,
  chargingPointConnectorActionResponseSchema,
  chargingPointEventStreamMessageSchema,
  runtimeAuthorizeRequestSchema,
  runtimeAuthorizeResponseSchema,
  runtimeOperationResponseSchema,
  runtimeSnapshotResponseSchema,
  runtimeStartTransactionRequestSchema,
  runtimeStartTransactionResponseSchema,
  runtimeStopTransactionRequestSchema,
  runtimeStopTransactionResponseSchema,
} from "@spark-bee/contracts";

import type { ServerDatabase } from "../../db";
import type { ChargingPointStreamEvent } from "../../lib/chargingPointEventStreamHub";
import { ValidationError } from "../../utils/errors";
import {
  createRuntimeOperationService,
  type RuntimeOperationServiceDependencies,
} from "./runtimeOperation.service";

export type RuntimeOperationRouteDependencies =
  RuntimeOperationServiceDependencies;

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

const connectorActionNotFoundResponse = {
  description: "请求的桩实例或枪口不存在或已删除。",
  content: jsonContent(apiErrorResponseSchema),
};

const chargingPointIdParamSchema = z.object({
  id: z.string().uuid().describe("桩实例的 UUID 主键。"),
});

const connectorActionParamSchema = chargingPointIdParamSchema.extend({
  connectorId: z.string().uuid().describe("枪口的 UUID 主键。"),
});

const operationSuccessResponse = (description: string) => ({
  description,
  content: jsonContent(runtimeOperationResponseSchema),
});

const runtimeSnapshotSuccessResponse = (description: string) => ({
  description,
  content: jsonContent(runtimeSnapshotResponseSchema),
});

const connectorActionSuccessResponse = (description: string) => ({
  description,
  content: jsonContent(chargingPointConnectorActionResponseSchema),
});

const authorizeSuccessResponse = {
  description: "鉴权动作已完成，结果见响应体 status。",
  content: jsonContent(runtimeAuthorizeResponseSchema),
};

const startTransactionSuccessResponse = {
  description: "开始交易动作已完成，结果见响应体 status。",
  content: jsonContent(runtimeStartTransactionResponseSchema),
};

const stopTransactionSuccessResponse = {
  description: "停止交易动作已完成，结果见响应体 status。",
  content: jsonContent(runtimeStopTransactionResponseSchema),
};

const eventStreamContent = {
  "text/event-stream": {
    schema: z.string().describe("SSE 事件流。"),
  },
};

const startChargingPointRoute = createRoute({
  method: "post",
  path: "/{id}/start",
  tags: ["RuntimeOperation"],
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
  tags: ["RuntimeOperation"],
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
  tags: ["RuntimeOperation"],
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

const getChargingPointRuntimeSnapshotRoute = createRoute({
  method: "get",
  path: "/{id}/runtime-snapshot",
  tags: ["RuntimeOperation"],
  summary: "查询桩实例运行状态快照",
  description:
    "查询当前服务进程中的桩实例运行状态快照，用于页面刷新后恢复当前运行态；没有 Actor 时返回 stopped 和空运行投影。",
  request: {
    params: chargingPointIdParamSchema,
  },
  responses: {
    200: runtimeSnapshotSuccessResponse("桩实例当前运行状态快照。"),
    400: validationErrorResponse,
    404: notFoundResponse,
  },
});

const plugConnectorRoute = createRoute({
  method: "post",
  path: "/{id}/connectors/{connectorId}/plug",
  tags: ["RuntimeOperation"],
  summary: "插枪",
  description:
    "在运行中的桩实例上执行车辆接入枪口模拟动作；不会自动鉴权或开始交易。",
  request: {
    params: connectorActionParamSchema,
  },
  responses: {
    200: connectorActionSuccessResponse("插枪后的枪口运行状态。"),
    400: validationErrorResponse,
    404: connectorActionNotFoundResponse,
    409: {
      description: "桩实例未运行，或当前枪口状态不允许插枪。",
      content: jsonContent(apiErrorResponseSchema),
    },
    502: {
      description: "插枪操作失败。",
      content: jsonContent(apiErrorResponseSchema),
    },
  },
});

const unplugConnectorRoute = createRoute({
  method: "post",
  path: "/{id}/connectors/{connectorId}/unplug",
  tags: ["RuntimeOperation"],
  summary: "拔枪",
  description:
    "在运行中的桩实例上执行车辆离开枪口模拟动作；存在活动交易时，以车辆断开原因为交易收尾后完成拔枪。",
  request: {
    params: connectorActionParamSchema,
  },
  responses: {
    200: connectorActionSuccessResponse("拔枪后的枪口运行状态。"),
    400: validationErrorResponse,
    404: connectorActionNotFoundResponse,
    409: {
      description: "桩实例未运行，或当前枪口状态不允许拔枪。",
      content: jsonContent(apiErrorResponseSchema),
    },
    502: {
      description: "拔枪操作失败。",
      content: jsonContent(apiErrorResponseSchema),
    },
  },
});

const authorizeConnectorRoute = createRoute({
  method: "post",
  path: "/{id}/connectors/{connectorId}/authorize",
  tags: ["RuntimeOperation"],
  summary: "鉴权",
  description:
    "在运行中的桩实例上使用 idTag 对指定枪口执行 OCPP Authorize；不会自动开始交易。",
  request: {
    params: connectorActionParamSchema,
    body: {
      required: true,
      content: jsonContent(runtimeAuthorizeRequestSchema),
    },
  },
  responses: {
    200: authorizeSuccessResponse,
    400: validationErrorResponse,
    404: connectorActionNotFoundResponse,
    409: {
      description: "桩实例未运行，不能执行鉴权。",
      content: jsonContent(apiErrorResponseSchema),
    },
    502: {
      description: "鉴权操作失败。",
      content: jsonContent(apiErrorResponseSchema),
    },
  },
});

const startTransactionRoute = createRoute({
  method: "post",
  path: "/{id}/connectors/{connectorId}/start-transaction",
  tags: ["RuntimeOperation"],
  summary: "开始交易",
  description:
    "在运行中的桩实例上对指定枪口执行 OCPP StartTransaction；不要求事先调用鉴权接口，授权结果由运行时和 CSMS 决定。",
  request: {
    params: connectorActionParamSchema,
    body: {
      required: true,
      content: jsonContent(runtimeStartTransactionRequestSchema),
    },
  },
  responses: {
    200: startTransactionSuccessResponse,
    400: validationErrorResponse,
    404: connectorActionNotFoundResponse,
    409: {
      description: "桩实例未运行，或当前枪口状态不允许开始交易。",
      content: jsonContent(apiErrorResponseSchema),
    },
    502: {
      description: "开始交易操作失败。",
      content: jsonContent(apiErrorResponseSchema),
    },
  },
});

const stopTransactionRoute = createRoute({
  method: "post",
  path: "/{id}/connectors/{connectorId}/stop-transaction",
  tags: ["RuntimeOperation"],
  summary: "停止交易",
  description:
    "在运行中的桩实例上对指定枪口执行 OCPP StopTransaction；reason 未提供时不会写入 OCPP 报文。",
  request: {
    params: connectorActionParamSchema,
    body: {
      required: true,
      content: jsonContent(runtimeStopTransactionRequestSchema),
    },
  },
  responses: {
    200: stopTransactionSuccessResponse,
    400: validationErrorResponse,
    404: connectorActionNotFoundResponse,
    409: {
      description: "桩实例未运行，交易不存在，或交易不属于路径中的枪口。",
      content: jsonContent(apiErrorResponseSchema),
    },
    502: {
      description: "停止交易操作失败。",
      content: jsonContent(apiErrorResponseSchema),
    },
  },
});

const getChargingPointEventsRoute = createRoute({
  method: "get",
  path: "/{id}/events",
  tags: ["ChargingPointEvent"],
  summary: "订阅桩事件流",
  description:
    "订阅单个桩实例的 SSE 事件流；连接建立后先发送当前运行状态快照，再推送后续实时协议事件。",
  request: {
    params: chargingPointIdParamSchema,
  },
  responses: {
    200: {
      description: "桩事件流已建立。",
      content: eventStreamContent,
    },
    400: validationErrorResponse,
    404: notFoundResponse,
  },
});

export function createRuntimeOperationRoute(
  database: ServerDatabase,
  dependencies: RuntimeOperationRouteDependencies = {},
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
  const service = createRuntimeOperationService(database, dependencies);

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

  route.openapi(getChargingPointRuntimeSnapshotRoute, async (context) => {
    const { id } = context.req.valid("param");
    return context.json(await service.getRuntimeSnapshot(id), 200);
  });

  route.openapi(plugConnectorRoute, async (context) => {
    const { id, connectorId } = context.req.valid("param");
    return context.json(await service.plug(id, connectorId), 200);
  });

  route.openapi(unplugConnectorRoute, async (context) => {
    const { id, connectorId } = context.req.valid("param");
    return context.json(await service.unplug(id, connectorId), 200);
  });

  route.openapi(authorizeConnectorRoute, async (context) => {
    const { id, connectorId } = context.req.valid("param");
    const input = context.req.valid("json");
    return context.json(await service.authorize(id, connectorId, input), 200);
  });

  route.openapi(startTransactionRoute, async (context) => {
    const { id, connectorId } = context.req.valid("param");
    const input = context.req.valid("json");
    return context.json(await service.startTransaction(id, connectorId, input), 200);
  });

  route.openapi(stopTransactionRoute, async (context) => {
    const { id, connectorId } = context.req.valid("param");
    const input = context.req.valid("json");
    return context.json(await service.stopTransaction(id, connectorId, input), 200);
  });

  route.openapi(getChargingPointEventsRoute, async (context) => {
    const { id } = context.req.valid("param");
    const bufferedEvents: ChargingPointStreamEvent[] = [];
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let closed = false;
    const emit = (event: ChargingPointStreamEvent) => {
      if (controller === undefined) {
        bufferedEvents.push(event);
        return;
      }

      controller.enqueue(encodeSseEvent(event.event, event.data));
      if (event.close === true) {
        closed = true;
        unsubscribe();
        controller.close();
      }
    };
    const subscription = await service.subscribeToEvents(id, emit);
    const { unsubscribe } = subscription;
    const snapshotMessage = chargingPointEventStreamMessageSchema.parse({
      event: "snapshot",
      data: subscription.snapshot,
    });
    const stream = new ReadableStream({
      start(streamController) {
        controller = streamController;
        controller.enqueue(encodeSseEvent(snapshotMessage.event, snapshotMessage.data));
        for (const event of bufferedEvents.splice(0)) {
          if (closed) {
            break;
          }
          emit(event);
        }
      },
      cancel() {
        unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache",
        "connection": "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      },
    });
  });

  return route;
}

function encodeSseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
