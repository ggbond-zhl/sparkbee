import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const HeartbeatRequestSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;
