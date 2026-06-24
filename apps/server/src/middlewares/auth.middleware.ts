import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { SESSION_COOKIE_NAME } from "../config/constant";
import type { AppBindings } from "../types/app";
import { unauthorized } from "../utils/errors";

const PUBLIC_PATHS = new Set([
  "/health",
  "/api/auth/login"
]);

export const authMiddleware = createMiddleware<AppBindings>(async (context, next) => {
  if (PUBLIC_PATHS.has(context.req.path) || context.req.path === "/") {
    await next();
    return;
  }

  const token = getCookie(context, SESSION_COOKIE_NAME);
  const session = context.get("services").auth.verify(token);
  if (session === null) {
    throw unauthorized();
  }

  context.set("auth", session);
  await next();
});
