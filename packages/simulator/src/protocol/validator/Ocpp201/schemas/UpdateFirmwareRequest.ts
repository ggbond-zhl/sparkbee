import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const FirmwareSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "location": z.string().max(512),
  "retrieveDateTime": z.string().datetime({ offset: true }),
  "installDateTime": z.string().datetime({ offset: true }).optional(),
  "signingCertificate": z.string().max(5500).optional(),
  "signature": z.string().max(800).optional()
}).strict();

export const UpdateFirmwareRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "retries": z.number().int().optional(),
  "retryInterval": z.number().int().optional(),
  "requestId": z.number().int(),
  "firmware": FirmwareSchema
}).strict();
export type UpdateFirmwareRequest = z.infer<typeof UpdateFirmwareRequestSchema>;
