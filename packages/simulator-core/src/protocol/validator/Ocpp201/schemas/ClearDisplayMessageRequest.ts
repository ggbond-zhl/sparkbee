import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const ClearDisplayMessageRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int()
}).strict();
export type ClearDisplayMessageRequest = z.infer<typeof ClearDisplayMessageRequestSchema>;
