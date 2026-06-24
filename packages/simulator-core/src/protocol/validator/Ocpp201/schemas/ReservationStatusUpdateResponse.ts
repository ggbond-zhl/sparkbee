import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const ReservationStatusUpdateResponseSchema = z.object({
  "customData": CustomDataSchema.optional()
}).strict();
export type ReservationStatusUpdateResponse = z.infer<typeof ReservationStatusUpdateResponseSchema>;
