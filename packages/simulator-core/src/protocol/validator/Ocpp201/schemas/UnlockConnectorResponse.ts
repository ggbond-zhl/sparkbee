import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const UnlockStatusEnumSchema = z.enum(["Unlocked","UnlockFailed","OngoingAuthorizedTransaction","UnknownConnector"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const UnlockConnectorResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": UnlockStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type UnlockConnectorResponse = z.infer<typeof UnlockConnectorResponseSchema>;
