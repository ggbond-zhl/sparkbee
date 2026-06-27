import { z } from 'zod';

export const GetConfigurationResponseSchema = z.object({
  configurationKey: z.array(z.object({
    key: z.string().max(50),
    readonly: z.boolean(),
    value: z.string().max(500).optional(),
  }).strict()).optional(),
  unknownKey: z.array(z.string().max(50)).optional(),
}).strict();
export type GetConfigurationResponse = z.infer<typeof GetConfigurationResponseSchema>;
