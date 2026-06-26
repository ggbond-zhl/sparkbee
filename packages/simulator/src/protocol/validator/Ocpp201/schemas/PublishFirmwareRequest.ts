import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const PublishFirmwareRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "location": z.string().max(512),
  "retries": z.number().int().optional(),
  "checksum": z.string().max(32),
  "requestId": z.number().int(),
  "retryInterval": z.number().int().optional()
}).strict();
export type PublishFirmwareRequest = z.infer<typeof PublishFirmwareRequestSchema>;
