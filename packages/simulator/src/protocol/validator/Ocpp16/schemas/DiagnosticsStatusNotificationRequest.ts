import { z } from 'zod';

export const DiagnosticsStatusNotificationRequestSchema = z.object({
  status: z.enum(['Idle', 'Uploaded', 'UploadFailed', 'Uploading']),
}).strict();
export type DiagnosticsStatusNotificationRequest = z.infer<typeof DiagnosticsStatusNotificationRequestSchema>;
