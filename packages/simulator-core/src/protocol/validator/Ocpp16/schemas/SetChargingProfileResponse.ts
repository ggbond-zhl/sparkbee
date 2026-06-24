import { z } from 'zod';

export const SetChargingProfileResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected', 'NotSupported']),
}).strict();
export type SetChargingProfileResponse = z.infer<typeof SetChargingProfileResponseSchema>;
