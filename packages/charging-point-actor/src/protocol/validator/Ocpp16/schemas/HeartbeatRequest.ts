import { z } from 'zod';

export const HeartbeatRequestSchema = z.object({}).strict();
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;
