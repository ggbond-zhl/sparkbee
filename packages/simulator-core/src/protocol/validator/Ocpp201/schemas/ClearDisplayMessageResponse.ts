import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ClearMessageStatusEnumSchema = z.enum(["Accepted","Unknown"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const ClearDisplayMessageResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": ClearMessageStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type ClearDisplayMessageResponse = z.infer<typeof ClearDisplayMessageResponseSchema>;
