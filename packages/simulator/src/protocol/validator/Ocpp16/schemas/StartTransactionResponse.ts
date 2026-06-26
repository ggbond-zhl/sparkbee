import { z } from 'zod';
import { IdTagInfoSchema } from './shared';

export const StartTransactionResponseSchema = z.object({
  idTagInfo: IdTagInfoSchema,
  transactionId: z.number().int(),
}).strict();
export type StartTransactionResponse = z.infer<typeof StartTransactionResponseSchema>;
