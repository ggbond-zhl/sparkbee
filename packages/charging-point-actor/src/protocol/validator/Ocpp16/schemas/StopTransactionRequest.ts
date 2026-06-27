import { z } from 'zod';
import { DateTimeStringSchema, MeterValueSchema } from './shared';

export const StopTransactionRequestSchema = z.object({
  idTag: z.string().max(20).optional(),
  meterStop: z.number().int(),
  timestamp: DateTimeStringSchema,
  transactionId: z.number().int(),
  reason: z.enum([
    'EmergencyStop', 'EVDisconnected', 'HardReset', 'Local', 'Other',
    'PowerLoss', 'Reboot', 'Remote', 'SoftReset', 'UnlockCommand', 'DeAuthorized',
  ]).optional(),
  transactionData: z.array(MeterValueSchema).min(1).optional(),
}).strict();
export type StopTransactionRequest = z.infer<typeof StopTransactionRequestSchema>;
