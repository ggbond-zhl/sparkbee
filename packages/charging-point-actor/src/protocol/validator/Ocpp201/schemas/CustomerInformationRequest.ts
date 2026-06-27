import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const HashAlgorithmEnumSchema = z.enum(["SHA256","SHA384","SHA512"]);

const IdTokenEnumSchema = z.enum(["Central","eMAID","ISO14443","ISO15693","KeyCode","Local","MacAddress","NoAuthorization"]);

const AdditionalInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "additionalIdToken": z.string().max(36),
  "type": z.string().max(50)
}).strict();

const CertificateHashDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "hashAlgorithm": HashAlgorithmEnumSchema,
  "issuerNameHash": z.string().max(128),
  "issuerKeyHash": z.string().max(128),
  "serialNumber": z.string().max(40)
}).strict();

const IdTokenSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "additionalInfo": z.array(AdditionalInfoSchema).min(1).optional(),
  "idToken": z.string().max(36),
  "type": IdTokenEnumSchema
}).strict();

export const CustomerInformationRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "customerCertificate": CertificateHashDataSchema.optional(),
  "idToken": IdTokenSchema.optional(),
  "requestId": z.number().int(),
  "report": z.boolean(),
  "clear": z.boolean(),
  "customerIdentifier": z.string().max(64).optional()
}).strict();
export type CustomerInformationRequest = z.infer<typeof CustomerInformationRequestSchema>;
