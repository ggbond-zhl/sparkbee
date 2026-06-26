import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const UpdateFirmwareStatusEnumSchema = z.enum(["Accepted","Rejected","AcceptedCanceled","InvalidCertificate","RevokedCertificate"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const UpdateFirmwareResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": UpdateFirmwareStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type UpdateFirmwareResponse = z.infer<typeof UpdateFirmwareResponseSchema>;
