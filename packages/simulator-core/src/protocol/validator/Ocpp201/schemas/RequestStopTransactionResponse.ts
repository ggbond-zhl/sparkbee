import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const RequestStartStopStatusEnumSchema = z.enum(["Accepted","Rejected"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const RequestStopTransactionResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": RequestStartStopStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type RequestStopTransactionResponse = z.infer<typeof RequestStopTransactionResponseSchema>;
