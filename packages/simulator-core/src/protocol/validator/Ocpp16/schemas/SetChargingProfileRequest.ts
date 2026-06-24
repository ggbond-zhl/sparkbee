import { z } from 'zod';
import { ChargingProfileSchema } from './shared';

export const SetChargingProfileRequestSchema = z.object({
  connectorId: z.number().int(),
  csChargingProfiles: ChargingProfileSchema,
}).strict();
export type SetChargingProfileRequest = z.infer<typeof SetChargingProfileRequestSchema>;
