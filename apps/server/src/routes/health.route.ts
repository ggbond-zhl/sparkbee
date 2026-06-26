import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

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

export function createHealthRoute() {
  const route = new OpenAPIHono();
  route.openapi(healthRoute, (context) => context.json({ status: "ok" }, 200));
  return route;
}
