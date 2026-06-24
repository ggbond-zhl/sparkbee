import { deleteCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";

import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "../config/constant";
import type { AppBindings } from "../types/app";
import { unauthorized } from "../utils/errors";
import { noContent, ok } from "../utils/response";
import { loginSchema } from "../validators/auth.validator";
import { parseJson } from "../validators/parse";

export class AuthController {
  async login(context: Context<AppBindings>) {
    const input = await parseJson(context, loginSchema);
    const token = context.get("services").auth.login(input.password);

    if (token === null) {
      throw unauthorized("管理员密码错误");
    }

    setCookie(context, SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production"
    });

    return ok(context, { subject: "admin" });
  }

  logout(context: Context<AppBindings>) {
    deleteCookie(context, SESSION_COOKIE_NAME, { path: "/" });
    return noContent(context);
  }

  session(context: Context<AppBindings>) {
    return ok(context, context.get("auth"));
  }
}
