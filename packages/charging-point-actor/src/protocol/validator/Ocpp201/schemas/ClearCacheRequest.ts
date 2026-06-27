import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const ClearCacheRequestSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type ClearCacheRequest = z.infer<typeof ClearCacheRequestSchema>;
