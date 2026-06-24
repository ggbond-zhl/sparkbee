import { Hono } from "hono";

import { EventController } from "../controllers/event.controller";
import type { AppBindings } from "../types/app";

export function createEventRoute() {
  const route = new Hono<AppBindings>();
  const controller = new EventController();

  route.get("/stream", (context) => controller.stream(context));

  return route;
}
