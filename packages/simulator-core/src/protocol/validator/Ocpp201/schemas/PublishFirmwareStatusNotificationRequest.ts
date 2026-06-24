import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const PublishFirmwareStatusEnumSchema = z.enum(["Idle","DownloadScheduled","Downloading","Downloaded","Published","DownloadFailed","DownloadPaused","InvalidChecksum","ChecksumVerified","PublishFailed"]);

export const PublishFirmwareStatusNotificationRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": PublishFirmwareStatusEnumSchema,
  "location": z.array(z.string().max(512)).min(1).optional(),
  "requestId": z.number().int().optional()
}).strict();
export type PublishFirmwareStatusNotificationRequest = z.infer<typeof PublishFirmwareStatusNotificationRequestSchema>;
