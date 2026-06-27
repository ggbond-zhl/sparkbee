import { z } from 'zod';

export const GetLocalListVersionRequestSchema = z.object({}).strict();
export type GetLocalListVersionRequest = z.infer<typeof GetLocalListVersionRequestSchema>;
