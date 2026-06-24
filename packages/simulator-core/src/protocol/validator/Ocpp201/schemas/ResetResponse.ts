import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ResetStatusEnumSchema = z.enum(["Accepted","Rejected","Scheduled"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const ResetResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": ResetStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type ResetResponse = z.infer<typeof ResetResponseSchema>;
