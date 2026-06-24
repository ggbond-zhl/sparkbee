import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const InstallCertificateUseEnumSchema = z.enum(["V2GRootCertificate","MORootCertificate","CSMSRootCertificate","ManufacturerRootCertificate"]);

export const InstallCertificateRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "certificateType": InstallCertificateUseEnumSchema,
  "certificate": z.string().max(5500)
}).strict();
export type InstallCertificateRequest = z.infer<typeof InstallCertificateRequestSchema>;
