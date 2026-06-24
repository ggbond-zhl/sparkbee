import { z } from 'zod';
import { DateTimeStringSchema } from './shared';

export const BootNotificationResponseSchema = z.object({
  status: z.enum(['Accepted', 'Pending', 'Rejected']),
  currentTime: DateTimeStringSchema,
  interval: z.number().int(),
}).strict();
export type BootNotificationResponse = z.infer<typeof BootNotificationResponseSchema>;
