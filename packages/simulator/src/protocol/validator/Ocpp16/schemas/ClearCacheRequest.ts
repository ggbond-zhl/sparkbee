import { z } from 'zod';

export const ClearCacheRequestSchema = z.object({}).strict();
export type ClearCacheRequest = z.infer<typeof ClearCacheRequestSchema>;
