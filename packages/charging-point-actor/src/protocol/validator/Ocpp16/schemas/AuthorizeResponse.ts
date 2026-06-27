import { z } from 'zod';
import { IdTagInfoSchema } from './shared';

export const AuthorizeResponseSchema = z.object({
  idTagInfo: IdTagInfoSchema,
}).strict();
export type AuthorizeResponse = z.infer<typeof AuthorizeResponseSchema>;
