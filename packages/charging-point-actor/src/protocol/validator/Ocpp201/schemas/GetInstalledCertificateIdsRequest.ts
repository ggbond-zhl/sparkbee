import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const GetCertificateIdUseEnumSchema = z.enum(["V2GRootCertificate","MORootCertificate","CSMSRootCertificate","V2GCertificateChain","ManufacturerRootCertificate"]);

export const GetInstalledCertificateIdsRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "certificateType": z.array(GetCertificateIdUseEnumSchema).min(1).optional()
}).strict();
export type GetInstalledCertificateIdsRequest = z.infer<typeof GetInstalledCertificateIdsRequestSchema>;
