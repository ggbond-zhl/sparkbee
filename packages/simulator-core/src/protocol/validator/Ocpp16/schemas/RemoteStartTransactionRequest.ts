import { z } from 'zod';
import { ChargingProfileSchema } from './shared';

export const RemoteStartTransactionRequestSchema = z.object({
  connectorId: z.number().int().optional(),
  idTag: z.string().max(20),
  chargingProfile: ChargingProfileSchema.optional(),
}).strict();
export type RemoteStartTransactionRequest = z.infer<typeof RemoteStartTransactionRequestSchema>;
