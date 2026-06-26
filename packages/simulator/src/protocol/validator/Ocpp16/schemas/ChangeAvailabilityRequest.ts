import { z } from 'zod';

export const ChangeAvailabilityRequestSchema = z.object({
  connectorId: z.number().int(),
  type: z.enum(['Inoperative', 'Operative']),
}).strict();
export type ChangeAvailabilityRequest = z.infer<typeof ChangeAvailabilityRequestSchema>;
