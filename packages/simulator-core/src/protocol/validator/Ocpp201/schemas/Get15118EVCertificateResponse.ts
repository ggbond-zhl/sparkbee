import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const Iso15118EVCertificateStatusEnumSchema = z.enum(["Accepted","Failed"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const Get15118EVCertificateResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": Iso15118EVCertificateStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional(),
  "exiResponse": z.string().max(5600)
}).strict();
export type Get15118EVCertificateResponse = z.infer<typeof Get15118EVCertificateResponseSchema>;
