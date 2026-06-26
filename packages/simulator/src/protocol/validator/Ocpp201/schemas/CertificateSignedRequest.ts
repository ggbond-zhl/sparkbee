import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const CertificateSigningUseEnumSchema = z.enum(["ChargingStationCertificate","V2GCertificate"]);

export const CertificateSignedRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "certificateChain": z.string().max(10000),
  "certificateType": CertificateSigningUseEnumSchema.optional()
}).strict();
export type CertificateSignedRequest = z.infer<typeof CertificateSignedRequestSchema>;
