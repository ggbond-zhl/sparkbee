import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const StatusNotificationResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type StatusNotificationResponse = z.infer<typeof StatusNotificationResponseSchema>;
