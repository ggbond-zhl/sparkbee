import { z } from 'zod';

export const ClearChargingProfileRequestSchema = z.object({
  id: z.number().int().optional(),
  connectorId: z.number().int().optional(),
  chargingProfilePurpose: z.enum(['ChargePointMaxProfile', 'TxDefaultProfile', 'TxProfile']).optional(),
  stackLevel: z.number().int().optional(),
}).strict();
export type ClearChargingProfileRequest = z.infer<typeof ClearChargingProfileRequestSchema>;
