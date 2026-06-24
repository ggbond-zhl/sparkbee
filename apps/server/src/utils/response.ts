import type { Context } from "hono";

export function ok<T>(context: Context, data: T) {
  return context.json({ data }, 200);
}

export function created<T>(context: Context, data: T) {
  return context.json({ data }, 201);
}

export function noContent(context: Context) {
  return context.body(null, 204);
}
