import { Hono } from "hono";

import { createHealthRoute } from "./health.route";

export function createRoutes() {
  const routes = new Hono();

  routes.route("/", createHealthRoute());

  return routes;
}
