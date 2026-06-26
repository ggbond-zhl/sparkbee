import { Hono } from "hono";

import { errorMiddleware } from "./middlewares/error.middleware";
import { loggerMiddleware } from "./middlewares/logger.middleware";
import { createRoutes } from "./routes";

export function createApp() {
  const app = new Hono();

  app.use("*", loggerMiddleware);
  app.onError(errorMiddleware);
  app.route("/", createRoutes());

  return app;
}
