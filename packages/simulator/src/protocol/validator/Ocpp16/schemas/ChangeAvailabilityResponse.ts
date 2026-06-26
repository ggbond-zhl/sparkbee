import { z } from 'zod';

export const ChangeAvailabilityResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected', 'Scheduled']),
}).strict();
export type ChangeAvailabilityResponse = z.infer<typeof ChangeAvailabilityResponseSchema>;
