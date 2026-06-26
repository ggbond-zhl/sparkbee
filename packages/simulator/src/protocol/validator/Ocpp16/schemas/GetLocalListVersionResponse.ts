import { z } from 'zod';

export const GetLocalListVersionResponseSchema = z.object({
  listVersion: z.number().int(),
}).strict();
export type GetLocalListVersionResponse = z.infer<typeof GetLocalListVersionResponseSchema>;
