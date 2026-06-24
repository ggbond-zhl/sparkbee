import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const UploadLogStatusEnumSchema = z.enum(["BadMessage","Idle","NotSupportedOperation","PermissionDenied","Uploaded","UploadFailure","Uploading","AcceptedCanceled"]);

export const LogStatusNotificationRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": UploadLogStatusEnumSchema,
  "requestId": z.number().int().optional()
}).strict();
export type LogStatusNotificationRequest = z.infer<typeof LogStatusNotificationRequestSchema>;
