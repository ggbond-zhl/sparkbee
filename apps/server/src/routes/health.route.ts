import { Hono } from "hono";

import type { AppBindings } from "../types/app";

export function createHealthRoute() {
  const route = new Hono<AppBindings>();
  route.get("/health", (context) => context.json({ status: "ok" }));
  return route;
}
