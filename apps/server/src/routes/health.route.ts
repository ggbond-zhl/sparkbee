import { Hono } from "hono";

export function createHealthRoute() {
  const route = new Hono();
  route.get("/health", (context) => context.json({ status: "ok" }));
  return route;
}
