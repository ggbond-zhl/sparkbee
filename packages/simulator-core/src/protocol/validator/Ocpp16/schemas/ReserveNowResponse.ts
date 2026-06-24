import { z } from 'zod';

export const ReserveNowResponseSchema = z.object({
  status: z.enum(['Accepted', 'Faulted', 'Occupied', 'Rejected', 'Unavailable']),
}).strict();
export type ReserveNowResponse = z.infer<typeof ReserveNowResponseSchema>;
