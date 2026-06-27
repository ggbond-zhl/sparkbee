import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const GenericStatusEnumSchema = z.enum(["Accepted","Rejected"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const PublishFirmwareResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": GenericStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type PublishFirmwareResponse = z.infer<typeof PublishFirmwareResponseSchema>;
