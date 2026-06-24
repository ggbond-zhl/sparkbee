import { Hono } from "hono";

import { AuthController } from "../controllers/auth.controller";
import type { AppBindings } from "../types/app";

export function createAuthRoute() {
  const route = new Hono<AppBindings>();
  const controller = new AuthController();

  route.post("/login", (context) => controller.login(context));
  route.post("/logout", (context) => controller.logout(context));
  route.get("/session", (context) => controller.session(context));

  return route;
}
