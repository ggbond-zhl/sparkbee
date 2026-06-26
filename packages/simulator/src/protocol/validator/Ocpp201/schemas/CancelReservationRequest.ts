import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const CancelReservationRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reservationId": z.number().int()
}).strict();
export type CancelReservationRequest = z.infer<typeof CancelReservationRequestSchema>;
