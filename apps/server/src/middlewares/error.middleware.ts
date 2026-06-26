import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import { AppError } from "../utils/errors";

export const errorMiddleware: ErrorHandler = (error, context) => {
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

  console.error(error);
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
