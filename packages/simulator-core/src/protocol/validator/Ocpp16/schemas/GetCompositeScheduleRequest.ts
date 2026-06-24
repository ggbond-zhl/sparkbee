import { z } from 'zod';

export const GetCompositeScheduleRequestSchema = z.object({
  connectorId: z.number().int(),
  duration: z.number().int(),
  chargingRateUnit: z.enum(['A', 'W']).optional(),
}).strict();
export type GetCompositeScheduleRequest = z.infer<typeof GetCompositeScheduleRequestSchema>;
