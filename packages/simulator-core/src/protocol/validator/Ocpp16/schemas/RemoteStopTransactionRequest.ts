import { z } from 'zod';

export const RemoteStopTransactionRequestSchema = z.object({
  transactionId: z.number().int(),
}).strict();
export type RemoteStopTransactionRequest = z.infer<typeof RemoteStopTransactionRequestSchema>;
