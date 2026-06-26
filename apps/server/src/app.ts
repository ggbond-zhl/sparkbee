import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";

import type { ServerDatabase } from "./db";
import { errorMiddleware } from "./middlewares/error.middleware";
import { createRoutes } from "./routes";

export interface AppDependencies {
  database?: ServerDatabase;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new OpenAPIHono();

  app.use("*", requestId());
  app.use("*", logger());
  app.onError(errorMiddleware);
  app.route("/", createRoutes(dependencies));
  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "SparkBee API",
      version: "0.0.1",
    },
  });
  app.get(
    "/docs",
    Scalar({
      pageTitle: "SparkBee API Reference",
      spec: {
        url: "/openapi.json",
      },
    }),
  );

  return app;
}
