import { z } from 'zod';

export const StopTransactionResponseSchema = z.record(z.string(), z.unknown());
export type StopTransactionResponse = z.infer<typeof StopTransactionResponseSchema>;
