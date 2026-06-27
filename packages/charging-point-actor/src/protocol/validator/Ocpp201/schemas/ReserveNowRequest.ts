import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ConnectorEnumSchema = z.enum(["cCCS1","cCCS2","cG105","cTesla","cType1","cType2","s309-1P-16A","s309-1P-32A","s309-3P-16A","s309-3P-32A","sBS1361","sCEE-7-7","sType2","sType3","Other1PhMax16A","Other1PhOver16A","Other3Ph","Pan","wInductive","wResonant","Undetermined","Unknown"]);

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

export const ReserveNowRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "expiryDateTime": z.string().datetime({ offset: true }),
  "connectorType": ConnectorEnumSchema.optional(),
  "idToken": IdTokenSchema,
  "evseId": z.number().int().optional(),
  "groupIdToken": IdTokenSchema.optional()
}).strict();
export type ReserveNowRequest = z.infer<typeof ReserveNowRequestSchema>;
