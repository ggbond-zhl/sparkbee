import { z } from 'zod';

export const DiagnosticsStatusNotificationResponseSchema = z.object({}).strict();
export type DiagnosticsStatusNotificationResponse = z.infer<typeof DiagnosticsStatusNotificationResponseSchema>;
