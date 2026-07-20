import type { MiddlewareHandler } from "hono";
import type { Logger } from "pino";

const HEALTH_PATHS = new Set(["/api/health", "/api/ready"]);

export function requestLogMiddleware(logger: Logger): MiddlewareHandler {
  return async (context, next) => {
    const startedAt = performance.now();
    await next();

    const status = context.res.status;
    const path = new URL(context.req.url).pathname;
    const fields = {
      event: "http.request.completed",
      requestId: context.get("requestId"),
      method: context.req.method,
      path,
      status,
      durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
    };

    if (status >= 500) {
      logger.error(fields, "HTTP request failed");
    } else if (status >= 400) {
      logger.warn(fields, "HTTP request completed with client error");
    } else if (HEALTH_PATHS.has(path)) {
      logger.info(fields, "Health check completed");
    } else {
      logger.info(fields, "HTTP request completed");
    }
  };
}
