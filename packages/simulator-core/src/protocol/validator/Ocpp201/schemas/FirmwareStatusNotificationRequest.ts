import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const FirmwareStatusEnumSchema = z.enum(["Downloaded","DownloadFailed","Downloading","DownloadScheduled","DownloadPaused","Idle","InstallationFailed","Installing","Installed","InstallRebooting","InstallScheduled","InstallVerificationFailed","InvalidSignature","SignatureVerified"]);

export const FirmwareStatusNotificationRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": FirmwareStatusEnumSchema,
  "requestId": z.number().int().optional()
}).strict();
export type FirmwareStatusNotificationRequest = z.infer<typeof FirmwareStatusNotificationRequestSchema>;
