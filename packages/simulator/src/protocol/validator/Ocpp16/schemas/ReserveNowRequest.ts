import { z } from 'zod';
import { DateTimeStringSchema } from './shared';

export const ReserveNowRequestSchema = z.object({
  connectorId: z.number().int(),
  expiryDate: DateTimeStringSchema,
  idTag: z.string().max(20),
  parentIdTag: z.string().max(20).optional(),
  reservationId: z.number().int(),
}).strict();
export type ReserveNowRequest = z.infer<typeof ReserveNowRequestSchema>;
