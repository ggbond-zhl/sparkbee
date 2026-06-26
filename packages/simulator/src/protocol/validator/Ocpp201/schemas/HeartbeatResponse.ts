import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const HeartbeatResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "currentTime": z.string().datetime({ offset: true })
}).strict();
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;
