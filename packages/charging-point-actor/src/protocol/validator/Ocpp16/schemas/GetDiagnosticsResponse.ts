import { z } from 'zod';

export const GetDiagnosticsResponseSchema = z.object({
  fileName: z.string().max(255).optional(),
}).strict();
export type GetDiagnosticsResponse = z.infer<typeof GetDiagnosticsResponseSchema>;
