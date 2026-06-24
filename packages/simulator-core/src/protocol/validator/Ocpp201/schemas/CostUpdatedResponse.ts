import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const CostUpdatedResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type CostUpdatedResponse = z.infer<typeof CostUpdatedResponseSchema>;
