import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const HashAlgorithmEnumSchema = z.enum(["SHA256","SHA384","SHA512"]);

const OCSPRequestDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "hashAlgorithm": HashAlgorithmEnumSchema,
  "issuerNameHash": z.string().max(128),
  "issuerKeyHash": z.string().max(128),
  "serialNumber": z.string().max(40),
  "responderURL": z.string().max(512)
}).strict();

export const GetCertificateStatusRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "ocspRequestData": OCSPRequestDataSchema
}).strict();
export type GetCertificateStatusRequest = z.infer<typeof GetCertificateStatusRequestSchema>;
