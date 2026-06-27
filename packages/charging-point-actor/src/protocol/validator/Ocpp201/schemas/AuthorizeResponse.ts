import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const AuthorizationStatusEnumSchema = z.enum(["Accepted","Blocked","ConcurrentTx","Expired","Invalid","NoCredit","NotAllowedTypeEVSE","NotAtThisLocation","NotAtThisTime","Unknown"]);

const AuthorizeCertificateStatusEnumSchema = z.enum(["Accepted","SignatureError","CertificateExpired","CertificateRevoked","NoCertificateAvailable","CertChainError","ContractCancelled"]);

const IdTokenEnumSchema = z.enum(["Central","eMAID","ISO14443","ISO15693","KeyCode","Local","MacAddress","NoAuthorization"]);

const MessageFormatEnumSchema = z.enum(["ASCII","HTML","URI","UTF8"]);

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

const MessageContentSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "format": MessageFormatEnumSchema,
  "language": z.string().max(8).optional(),
  "content": z.string().max(512)
}).strict();

const IdTokenInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": AuthorizationStatusEnumSchema,
  "cacheExpiryDateTime": z.string().datetime({ offset: true }).optional(),
  "chargingPriority": z.number().int().optional(),
  "language1": z.string().max(8).optional(),
  "evseId": z.array(z.number().int()).min(1).optional(),
  "groupIdToken": IdTokenSchema.optional(),
  "language2": z.string().max(8).optional(),
  "personalMessage": MessageContentSchema.optional()
}).strict();

export const AuthorizeResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "idTokenInfo": IdTokenInfoSchema,
  "certificateStatus": AuthorizeCertificateStatusEnumSchema.optional()
}).strict();
export type AuthorizeResponse = z.infer<typeof AuthorizeResponseSchema>;
