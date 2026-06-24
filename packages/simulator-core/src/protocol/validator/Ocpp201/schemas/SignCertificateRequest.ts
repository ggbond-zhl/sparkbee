import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const CertificateSigningUseEnumSchema = z.enum(["ChargingStationCertificate","V2GCertificate"]);

export const SignCertificateRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "csr": z.string().max(5500),
  "certificateType": CertificateSigningUseEnumSchema.optional()
}).strict();
export type SignCertificateRequest = z.infer<typeof SignCertificateRequestSchema>;
