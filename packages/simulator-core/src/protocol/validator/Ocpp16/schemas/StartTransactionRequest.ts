import { z } from 'zod';
import { DateTimeStringSchema } from './shared';

export const StartTransactionRequestSchema = z.object({
  connectorId: z.number().int(),
  idTag: z.string().max(20),
  meterStart: z.number().int(),
  reservationId: z.number().int().optional(),
  timestamp: DateTimeStringSchema,
}).strict();
export type StartTransactionRequest = z.infer<typeof StartTransactionRequestSchema>;
