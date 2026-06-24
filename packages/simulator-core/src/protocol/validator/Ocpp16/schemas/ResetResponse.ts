import { z } from 'zod';

export const ResetResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected']),
}).strict();
export type ResetResponse = z.infer<typeof ResetResponseSchema>;
