import type { z } from "zod";

import { ValidationError } from "./errors";

export function parseRequest<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  throw new ValidationError(
    result.error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })),
  );
}
