import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const CertificateSignedStatusEnumSchema = z.enum(["Accepted","Rejected"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const CertificateSignedResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": CertificateSignedStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type CertificateSignedResponse = z.infer<typeof CertificateSignedResponseSchema>;
