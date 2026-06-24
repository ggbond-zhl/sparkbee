import { z } from 'zod';
import { DateTimeStringSchema } from './shared';

export const GetDiagnosticsRequestSchema = z.object({
  location: z.string().url(),
  retries: z.number().int().optional(),
  retryInterval: z.number().int().optional(),
  startTime: DateTimeStringSchema.optional(),
  stopTime: DateTimeStringSchema.optional(),
}).strict();
export type GetDiagnosticsRequest = z.infer<typeof GetDiagnosticsRequestSchema>;
