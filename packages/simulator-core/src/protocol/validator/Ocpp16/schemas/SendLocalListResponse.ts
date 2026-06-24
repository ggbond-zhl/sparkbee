import { z } from 'zod';

export const SendLocalListResponseSchema = z.object({
  status: z.enum(['Accepted', 'Failed', 'NotSupported', 'VersionMismatch']),
}).strict();
export type SendLocalListResponse = z.infer<typeof SendLocalListResponseSchema>;
