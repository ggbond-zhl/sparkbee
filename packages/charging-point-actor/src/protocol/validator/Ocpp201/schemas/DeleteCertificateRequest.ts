import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const HashAlgorithmEnumSchema = z.enum(["SHA256","SHA384","SHA512"]);

const CertificateHashDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "hashAlgorithm": HashAlgorithmEnumSchema,
  "issuerNameHash": z.string().max(128),
  "issuerKeyHash": z.string().max(128),
  "serialNumber": z.string().max(40)
}).strict();

export const DeleteCertificateRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "certificateHashData": CertificateHashDataSchema
}).strict();
export type DeleteCertificateRequest = z.infer<typeof DeleteCertificateRequestSchema>;
