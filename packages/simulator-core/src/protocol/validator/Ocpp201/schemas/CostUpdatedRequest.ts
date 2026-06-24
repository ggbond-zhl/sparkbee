import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const CostUpdatedRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "totalCost": z.number(),
  "transactionId": z.string().max(36)
}).strict();
export type CostUpdatedRequest = z.infer<typeof CostUpdatedRequestSchema>;
