import { z } from 'zod';

export const AuthorizeRequestSchema = z.object({
  idTag: z.string().max(20),
}).strict();
export type AuthorizeRequest = z.infer<typeof AuthorizeRequestSchema>;
