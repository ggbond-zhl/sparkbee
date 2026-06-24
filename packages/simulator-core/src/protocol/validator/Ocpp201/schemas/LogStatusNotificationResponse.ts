import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const LogStatusNotificationResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type LogStatusNotificationResponse = z.infer<typeof LogStatusNotificationResponseSchema>;
