import { z } from 'zod';

export const CancelReservationRequestSchema = z.object({
  reservationId: z.number().int(),
}).strict();
export type CancelReservationRequest = z.infer<typeof CancelReservationRequestSchema>;
