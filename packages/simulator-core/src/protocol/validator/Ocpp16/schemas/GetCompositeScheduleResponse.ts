import { z } from 'zod';
import { ChargingScheduleSchema, DateTimeStringSchema } from './shared';

export const GetCompositeScheduleResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected']),
  connectorId: z.number().int().optional(),
  scheduleStart: DateTimeStringSchema.optional(),
  chargingSchedule: ChargingScheduleSchema.optional(),
}).strict();
export type GetCompositeScheduleResponse = z.infer<typeof GetCompositeScheduleResponseSchema>;
