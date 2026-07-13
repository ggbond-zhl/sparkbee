import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";

import type { ServerDatabase } from "./db";
import type { ChargingPointActorHost } from "./lib/chargingPointActorHost";
import type { ChargingPointRuntimeLogSinkFactory } from "./lib/chargingPointRuntimeLogWriter";
import { errorMiddleware } from "./middlewares/error.middleware";
import type { ChargingPointActorFactory } from "./modules/runtimeOperation/runtimeOperation.service";
import { createRoutes } from "./routes";

export interface AppDependencies {
  database?: ServerDatabase;
  environment?: string;
  corsAllowedOrigin?: string;
  timeoutMs?: number;
  chargingPointActorHost?: ChargingPointActorHost;
  createChargingPointActor?: ChargingPointActorFactory;
  runtimeLogWriter?: ChargingPointRuntimeLogSinkFactory;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new OpenAPIHono();
  const environment = dependencies.environment ?? process.env.NODE_ENV ?? "development";

  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({ origin: dependencies.corsAllowedOrigin ?? "http://localhost:3001" }),
  );
  app.use("*", timeout(dependencies.timeoutMs ?? 30_000));
  if (environment === "production") {
    app.use("*", compress());
  }
  if (environment === "development") {
    app.use("*", logger());
  }
  app.onError(errorMiddleware);
  app.route(
    "/api",
    createRoutes({
      ...dependencies,
    }),
  );
  app.doc31("/api/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "SparkBee API",
      version: "0.0.1",
    },
  });
  app.get(
    "/api/docs",
    Scalar({
      pageTitle: "SparkBee API Reference",
      spec: {
        url: "/api/openapi.json",
      },
    }),
  );

  return app;
}
