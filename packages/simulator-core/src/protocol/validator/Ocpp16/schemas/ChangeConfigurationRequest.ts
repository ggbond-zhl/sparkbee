import { z } from 'zod';

export const ChangeConfigurationRequestSchema = z.object({
  key: z.string().max(50),
  value: z.string().max(500),
}).strict();
export type ChangeConfigurationRequest = z.infer<typeof ChangeConfigurationRequestSchema>;
