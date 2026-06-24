import { z } from 'zod';
import { IdTagInfoSchema } from './shared';

export const SendLocalListRequestSchema = z.object({
  listVersion: z.number().int(),
  localAuthorizationList: z.array(z.object({
    idTag: z.string().max(20),
    idTagInfo: IdTagInfoSchema.optional(),
  }).strict()).optional(),
  updateType: z.enum(['Differential', 'Full']),
}).strict();
export type SendLocalListRequest = z.infer<typeof SendLocalListRequestSchema>;
