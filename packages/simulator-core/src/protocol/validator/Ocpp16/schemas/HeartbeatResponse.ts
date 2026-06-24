import { z } from 'zod';

export const HeartbeatResponseSchema = z.object({
  currentTime: z.unknown().optional(),
}).strict();
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;
