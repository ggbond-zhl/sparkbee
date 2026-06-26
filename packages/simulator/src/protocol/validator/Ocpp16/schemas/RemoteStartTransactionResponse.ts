import { z } from 'zod';

export const RemoteStartTransactionResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected']),
}).strict();
export type RemoteStartTransactionResponse = z.infer<typeof RemoteStartTransactionResponseSchema>;
