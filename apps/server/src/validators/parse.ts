import type { Context } from "hono";
import type { ZodType } from "zod";

import { badRequest } from "../utils/errors";

export async function parseJson<T>(context: Context, schema: ZodType<T>): Promise<T> {
  let body: unknown;

  try {
    body = await context.req.json();
  } catch {
    throw badRequest("请求体必须是 JSON");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest("请求参数无效", result.error.flatten());
  }

  return result.data;
}

export function parseParams<T>(context: Context, schema: ZodType<T>): T {
  const result = schema.safeParse(context.req.param());
  if (!result.success) {
    throw badRequest("路径参数无效", result.error.flatten());
  }

  return result.data;
}

export function parseQuery<T>(context: Context, schema: ZodType<T>): T {
  const result = schema.safeParse(context.req.query());
  if (!result.success) {
    throw badRequest("查询参数无效", result.error.flatten());
  }

  return result.data;
}
