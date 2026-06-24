import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const DisplayMessageStatusEnumSchema = z.enum(["Accepted","NotSupportedMessageFormat","Rejected","NotSupportedPriority","NotSupportedState","UnknownTransaction"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const SetDisplayMessageResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": DisplayMessageStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type SetDisplayMessageResponse = z.infer<typeof SetDisplayMessageResponseSchema>;
