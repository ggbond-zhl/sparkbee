import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ReservationUpdateStatusEnumSchema = z.enum(["Expired","Removed"]);

export const ReservationStatusUpdateRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reservationId": z.number().int(),
  "reservationUpdateStatus": ReservationUpdateStatusEnumSchema
}).strict();
export type ReservationStatusUpdateRequest = z.infer<typeof ReservationStatusUpdateRequestSchema>;
