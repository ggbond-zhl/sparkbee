import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const UnpublishFirmwareStatusEnumSchema = z.enum(["DownloadOngoing","NoFirmware","Unpublished"]);

export const UnpublishFirmwareResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": UnpublishFirmwareStatusEnumSchema
}).strict();
export type UnpublishFirmwareResponse = z.infer<typeof UnpublishFirmwareResponseSchema>;
