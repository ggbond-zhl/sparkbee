import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).describe("页码，从 1 开始。"),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe("每页数量，最大 100。"),
});

export function paginatedResponseSchema<TItem extends z.ZodType>(itemSchema: TItem) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  });
}

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
