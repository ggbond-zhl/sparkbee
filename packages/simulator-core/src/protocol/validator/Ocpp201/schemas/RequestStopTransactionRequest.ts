import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const RequestStopTransactionRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "transactionId": z.string().max(36)
}).strict();
export type RequestStopTransactionRequest = z.infer<typeof RequestStopTransactionRequestSchema>;
