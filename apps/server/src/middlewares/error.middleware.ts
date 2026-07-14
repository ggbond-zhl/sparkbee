import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Logger } from "pino";

import type { ErrorReporter } from "../config/errorReporter";
import { AppError } from "../utils/errors";

export function createErrorMiddleware(
  logger: Logger,
  errorReporter: ErrorReporter,
): ErrorHandler {
  return (error, context) => {
    if (error instanceof AppError) {
      return context.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details
          }
        },
        error.status as never,
      );
    }

    if (error instanceof HTTPException) {
      return context.json(
        {
          error: {
            code: error.status === 504 ? "GATEWAY_TIMEOUT" : "HTTP_EXCEPTION",
            message: error.message || "HTTP exception"
          }
        },
        error.status as never,
      );
    }

    const reportContext = {
      requestId: context.get("requestId"),
      method: context.req.method,
      path: new URL(context.req.url).pathname,
      module: "http",
    };
    logger.error({
      event: "http.request.failed",
      ...reportContext,
      error,
    }, "HTTP 请求发生非预期异常");
    errorReporter.captureException(error, reportContext);
    return context.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error"
        }
      },
      500,
    );
  };
};
