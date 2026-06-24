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

const IdTokenSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "additionalInfo": z.array(AdditionalInfoSchema).min(1).optional(),
  "idToken": z.string().max(36),
  "type": IdTokenEnumSchema
}).strict();

const OCSPRequestDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "hashAlgorithm": HashAlgorithmEnumSchema,
  "issuerNameHash": z.string().max(128),
  "issuerKeyHash": z.string().max(128),
  "serialNumber": z.string().max(40),
  "responderURL": z.string().max(512)
}).strict();

export const AuthorizeRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "idToken": IdTokenSchema,
  "certificate": z.string().max(5500).optional(),
  "iso15118CertificateHashData": z.array(OCSPRequestDataSchema).min(1).max(4).optional()
}).strict();
export type AuthorizeRequest = z.infer<typeof AuthorizeRequestSchema>;
