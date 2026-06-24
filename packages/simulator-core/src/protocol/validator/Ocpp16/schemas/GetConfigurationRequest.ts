import { z } from 'zod';

export const GetConfigurationRequestSchema = z.object({
  key: z.array(z.string().max(50)).optional(),
}).strict();
export type GetConfigurationRequest = z.infer<typeof GetConfigurationRequestSchema>;
