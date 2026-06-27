import { z } from 'zod';

export const StatusNotificationResponseSchema = z.record(z.string(), z.unknown());
export type StatusNotificationResponse = z.infer<typeof StatusNotificationResponseSchema>;
