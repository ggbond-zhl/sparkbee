import { z } from 'zod';

export const CancelReservationResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected']),
}).strict();
export type CancelReservationResponse = z.infer<typeof CancelReservationResponseSchema>;
