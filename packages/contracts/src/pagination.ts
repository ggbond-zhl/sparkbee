import { z } from "zod";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).describe("页码，从 1 开始。"),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value): value is PageSize =>
      PAGE_SIZE_OPTIONS.includes(value as PageSize),
    )
    .default(20)
    .describe("每页数量，可选 10、20、50、100。"),
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
