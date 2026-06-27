import { z } from 'zod';

export const TriggerMessageResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected', 'NotImplemented']),
}).strict();
export type TriggerMessageResponse = z.infer<typeof TriggerMessageResponseSchema>;
