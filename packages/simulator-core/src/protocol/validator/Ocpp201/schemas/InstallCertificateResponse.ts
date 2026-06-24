import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const InstallCertificateStatusEnumSchema = z.enum(["Accepted","Rejected","Failed"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const InstallCertificateResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": InstallCertificateStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type InstallCertificateResponse = z.infer<typeof InstallCertificateResponseSchema>;
