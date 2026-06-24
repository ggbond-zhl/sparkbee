import { z } from 'zod';

export const FirmwareStatusNotificationRequestSchema = z.object({
  status: z.enum(['Downloaded', 'DownloadFailed', 'Downloading', 'Idle', 'InstallationFailed', 'Installing', 'Installed']),
}).strict();
export type FirmwareStatusNotificationRequest = z.infer<typeof FirmwareStatusNotificationRequestSchema>;
