import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const UnpublishFirmwareRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "checksum": z.string().max(32)
}).strict();
export type UnpublishFirmwareRequest = z.infer<typeof UnpublishFirmwareRequestSchema>;
