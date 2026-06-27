import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const GetCertificateStatusEnumSchema = z.enum(["Accepted","Failed"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const GetCertificateStatusResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": GetCertificateStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional(),
  "ocspResult": z.string().max(5500).optional()
}).strict();
export type GetCertificateStatusResponse = z.infer<typeof GetCertificateStatusResponseSchema>;
