import { Hono } from "hono";
import { logger } from "hono/logger";

import type { ServerDatabase } from "./db";
import { errorMiddleware } from "./middlewares/error.middleware";
import { createRoutes } from "./routes";

export interface AppDependencies {
  database?: ServerDatabase;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono();

  app.use("*", logger());
  app.onError(errorMiddleware);
  app.route("/", createRoutes(dependencies));

  return app;
}
