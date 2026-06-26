import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const DeleteCertificateStatusEnumSchema = z.enum(["Accepted","Failed","NotFound"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const DeleteCertificateResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": DeleteCertificateStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type DeleteCertificateResponse = z.infer<typeof DeleteCertificateResponseSchema>;
