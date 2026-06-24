import { Hono } from "hono";

import { authMiddleware } from "./middlewares/auth.middleware";
import { errorMiddleware } from "./middlewares/error.middleware";
import { loggerMiddleware } from "./middlewares/logger.middleware";
import { createRoutes } from "./routes";
import type { Services } from "./services";
import type { AppBindings } from "./types/app";

export function createApp(services: Services) {
  const app = new Hono<AppBindings>();

  app.use("*", async (context, next) => {
    context.set("services", services);
    await next();
  });
  app.use("*", loggerMiddleware);
  app.use("*", authMiddleware);
  app.onError(errorMiddleware);
  app.route("/", createRoutes());

  return app;
}
