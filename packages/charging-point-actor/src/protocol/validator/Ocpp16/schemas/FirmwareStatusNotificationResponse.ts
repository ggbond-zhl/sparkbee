import { z } from 'zod';

export const FirmwareStatusNotificationResponseSchema = z.object({}).strict();
export type FirmwareStatusNotificationResponse = z.infer<typeof FirmwareStatusNotificationResponseSchema>;
