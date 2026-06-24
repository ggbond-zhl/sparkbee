import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const TriggerMessageStatusEnumSchema = z.enum(["Accepted","Rejected","NotImplemented"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const TriggerMessageResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": TriggerMessageStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type TriggerMessageResponse = z.infer<typeof TriggerMessageResponseSchema>;
