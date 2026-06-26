import { z } from 'zod';

export const RemoteStopTransactionResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected']),
}).strict();
export type RemoteStopTransactionResponse = z.infer<typeof RemoteStopTransactionResponseSchema>;
