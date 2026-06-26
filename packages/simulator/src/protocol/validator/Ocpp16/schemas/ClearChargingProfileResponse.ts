import { z } from 'zod';

export const ClearChargingProfileResponseSchema = z.object({
  status: z.enum(['Accepted', 'Unknown']),
}).strict();
export type ClearChargingProfileResponse = z.infer<typeof ClearChargingProfileResponseSchema>;
