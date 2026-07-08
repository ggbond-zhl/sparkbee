import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";

import type { ServerDatabase } from "./db";
import { ChargingPointActorRegistry } from "./lib/chargingPointActorRegistry";
import { ChargingPointRuntimeLogFileWriter } from "./lib/chargingPointRuntimeLogFileWriter";
import { ChargingPointEventStreamHub } from "./lib/chargingPointEventStreamHub";
import { errorMiddleware } from "./middlewares/error.middleware";
import type { ChargingPointActorFactory } from "./modules/runtimeOperation/runtimeOperation.service";
import { createRoutes } from "./routes";

export interface AppDependencies {
  database?: ServerDatabase;
  environment?: string;
  timeoutMs?: number;
  chargingPointActorRegistry?: ChargingPointActorRegistry;
  runtimeLogDirectory?: string;
  chargingPointRuntimeLogFileWriter?: ChargingPointRuntimeLogFileWriter;
  chargingPointEventStreamHub?: ChargingPointEventStreamHub;
  createChargingPointActor?: ChargingPointActorFactory;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new OpenAPIHono();
  const environment = dependencies.environment ?? process.env.NODE_ENV ?? "development";

  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use("*", cors());
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
      chargingPointActorRegistry:
        dependencies.chargingPointActorRegistry ?? new ChargingPointActorRegistry(),
      chargingPointRuntimeLogFileWriter:
        dependencies.chargingPointRuntimeLogFileWriter ??
        new ChargingPointRuntimeLogFileWriter(
          dependencies.runtimeLogDirectory ?? "logs/runtime",
        ),
      chargingPointEventStreamHub:
        dependencies.chargingPointEventStreamHub ?? new ChargingPointEventStreamHub(),
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
