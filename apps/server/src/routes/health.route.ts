import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";

import type { ServerDatabase } from "../db";

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "健康检查",
  description: "检查后端服务是否正常响应。",
  responses: {
    200: {
      description: "后端服务正常。",
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("ok").describe("服务健康状态。"),
          }),
        },
      },
    },
  },
});

const readinessRoute = createRoute({
  method: "get",
  path: "/ready",
  tags: ["System"],
  summary: "就绪检查",
  description: "检查后端服务是否能够连接数据库并处理业务请求。",
  responses: {
    200: {
      description: "后端服务及数据库已就绪。",
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("ready").describe("服务就绪状态。"),
          }),
        },
      },
    },
    503: {
      description: "后端服务尚未就绪。",
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("unavailable").describe("服务不可用状态。"),
          }),
        },
      },
    },
  },
});

export function createHealthRoute(database?: ServerDatabase) {
  const route = new OpenAPIHono();
  route.openapi(healthRoute, (context) => context.json({ status: "ok" }, 200));
  route.openapi(readinessRoute, async (context) => {
    if (database === undefined) {
      return context.json({ status: "unavailable" }, 503);
    }

    try {
      await database.execute(sql`select 1`);
      return context.json({ status: "ready" }, 200);
    } catch {
      return context.json({ status: "unavailable" }, 503);
    }
  });
  return route;
}
