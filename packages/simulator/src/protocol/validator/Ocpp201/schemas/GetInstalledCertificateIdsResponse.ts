import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const GetCertificateIdUseEnumSchema = z.enum(["V2GRootCertificate","MORootCertificate","CSMSRootCertificate","V2GCertificateChain","ManufacturerRootCertificate"]);

const GetInstalledCertificateStatusEnumSchema = z.enum(["Accepted","NotFound"]);

const HashAlgorithmEnumSchema = z.enum(["SHA256","SHA384","SHA512"]);

const CertificateHashDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "hashAlgorithm": HashAlgorithmEnumSchema,
  "issuerNameHash": z.string().max(128),
  "issuerKeyHash": z.string().max(128),
  "serialNumber": z.string().max(40)
}).strict();

const CertificateHashDataChainSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "certificateHashData": CertificateHashDataSchema,
  "certificateType": GetCertificateIdUseEnumSchema,
  "childCertificateHashData": z.array(CertificateHashDataSchema).min(1).max(4).optional()
}).strict();

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const GetInstalledCertificateIdsResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": GetInstalledCertificateStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional(),
  "certificateHashDataChain": z.array(CertificateHashDataChainSchema).min(1).optional()
}).strict();
export type GetInstalledCertificateIdsResponse = z.infer<typeof GetInstalledCertificateIdsResponseSchema>;
