import { z } from 'zod';
import { MeterValueSchema } from './shared';

export const MeterValuesRequestSchema = z.object({
  connectorId: z.number().int(),
  transactionId: z.number().int().optional(),
  meterValue: z.array(MeterValueSchema).min(1),
}).strict();
export type MeterValuesRequest = z.infer<typeof MeterValuesRequestSchema>;
