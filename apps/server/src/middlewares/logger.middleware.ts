import { createMiddleware } from "hono/factory";

export const loggerMiddleware = createMiddleware(async (context, next) => {
  const startedAt = Date.now();
  await next();
  const durationMs = Date.now() - startedAt;
  console.info(`${context.req.method} ${context.req.path} ${context.res.status} ${durationMs}ms`);
});
