import { Hono } from "hono";

import type { AppBindings } from "../types/app";
import { createAuthRoute } from "./auth.route";
import { createEventRoute } from "./event.route";
import { createHealthRoute } from "./health.route";
import { createStationRoute } from "./station.route";

export function createRoutes() {
  const routes = new Hono<AppBindings>();

  routes.route("/", createHealthRoute());
  routes.route("/api/auth", createAuthRoute());
  routes.route("/api/events", createEventRoute());
  routes.route("/api/stations", createStationRoute());

  return routes;
}
