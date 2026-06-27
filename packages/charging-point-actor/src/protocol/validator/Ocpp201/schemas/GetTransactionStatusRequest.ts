import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const GetTransactionStatusRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "transactionId": z.string().max(36).optional()
}).strict();
export type GetTransactionStatusRequest = z.infer<typeof GetTransactionStatusRequestSchema>;
