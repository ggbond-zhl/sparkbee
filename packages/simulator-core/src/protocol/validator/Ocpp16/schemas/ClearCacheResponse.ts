import { z } from 'zod';

export const ClearCacheResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected']),
}).strict();
export type ClearCacheResponse = z.infer<typeof ClearCacheResponseSchema>;
