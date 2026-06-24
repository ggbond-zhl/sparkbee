import { z } from 'zod';

export const ResetRequestSchema = z.object({
  type: z.enum(['Hard', 'Soft']),
}).strict();
export type ResetRequest = z.infer<typeof ResetRequestSchema>;
