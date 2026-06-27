import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const GetTransactionStatusResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "ongoingIndicator": z.boolean().optional(),
  "messagesInQueue": z.boolean()
}).strict();
export type GetTransactionStatusResponse = z.infer<typeof GetTransactionStatusResponseSchema>;
