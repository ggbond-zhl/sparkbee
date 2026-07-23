import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import pino from "pino";
import type { Logger } from "pino";

import { noopErrorReporter } from "./config/errorReporter";
import type { ErrorReporter } from "./config/errorReporter";
import type { ServerDatabase } from "./db";
import { verifyDatabaseConnection } from "./db/connection";
import type { ChargingPointActorHost } from "./lib/chargingPointActorHost";
import type { ActorLogSinkFactory } from "./lib/actorLogWriter";
import type { ProtocolObservationSink } from "./modules/protocolObservation/protocolObservation.writer";
import { createErrorMiddleware } from "./middlewares/error.middleware";
import { requestLogMiddleware } from "./middlewares/requestLog.middleware";
import type { ChargingPointActorFactory } from "./modules/runtimeOperation/runtimeOperation.service";
import { createRoutes } from "./routes";

export interface AppDependencies {
  database?: ServerDatabase;
  environment?: string;
  corsAllowedOrigin?: string;
  timeoutMs?: number;
  chargingPointActorHost?: ChargingPointActorHost;
  createChargingPointActor?: ChargingPointActorFactory;
  actorLogWriter?: ActorLogSinkFactory;
  protocolObservationWriter?: ProtocolObservationSink;
  logger?: Logger;
  errorReporter?: ErrorReporter;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new OpenAPIHono();
  const environment = dependencies.environment ?? process.env.NODE_ENV ?? "development";
  const serverLogger = dependencies.logger ?? pino({ level: "silent" });
  const errorReporter = dependencies.errorReporter ?? noopErrorReporter;

  app.use("*", requestId());
  app.use("*", requestLogMiddleware(serverLogger));
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({ origin: dependencies.corsAllowedOrigin ?? "http://localhost:3001" }),
  );
  app.use("*", timeout(dependencies.timeoutMs ?? 30_000));
  if (environment === "production") {
    app.use("*", compress());
  }
  app.onError(createErrorMiddleware(serverLogger, errorReporter));
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

export interface StartServerOptions {
  database: ServerDatabase;
  errorReporter: ErrorReporter;
  listen(): void;
  logger: Logger;
  onStarted(): void;
  prepare?(): Promise<void>;
}

export async function startServer({
  database,
  errorReporter,
  listen,
  logger,
  onStarted,
  prepare,
}: StartServerOptions): Promise<void> {
  try {
    await verifyDatabaseConnection(database);
  } catch (error) {
    logger.error({
      event: "database.connection.failed",
      error,
    }, "Database connection check failed; server startup aborted");
    errorReporter.captureException(error, { module: "database.startup" });
    throw error;
  }

  try {
    await prepare?.();
  } catch (error) {
    logger.error({
      event: "server.prepare.failed",
      error,
    }, "Server preparation failed; server startup aborted");
    errorReporter.captureException(error, { module: "server.prepare" });
    throw error;
  }

  listen();
  onStarted();
}
