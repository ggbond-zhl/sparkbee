import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const CertificateActionEnumSchema = z.enum(["Install","Update"]);

export const Get15118EVCertificateRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "iso15118SchemaVersion": z.string().max(50),
  "action": CertificateActionEnumSchema,
  "exiRequest": z.string().max(5600)
}).strict();
export type Get15118EVCertificateRequest = z.infer<typeof Get15118EVCertificateRequestSchema>;
