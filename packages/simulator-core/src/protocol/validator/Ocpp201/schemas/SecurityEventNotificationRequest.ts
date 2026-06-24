import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const SecurityEventNotificationRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "type": z.string().max(50),
  "timestamp": z.string().datetime({ offset: true }),
  "techInfo": z.string().max(255).optional()
}).strict();
export type SecurityEventNotificationRequest = z.infer<typeof SecurityEventNotificationRequestSchema>;
