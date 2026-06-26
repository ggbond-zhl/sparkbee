import { z } from 'zod';

export const ChangeConfigurationResponseSchema = z.object({
  status: z.enum(['Accepted', 'Rejected', 'RebootRequired', 'NotSupported']),
}).strict();
export type ChangeConfigurationResponse = z.infer<typeof ChangeConfigurationResponseSchema>;
