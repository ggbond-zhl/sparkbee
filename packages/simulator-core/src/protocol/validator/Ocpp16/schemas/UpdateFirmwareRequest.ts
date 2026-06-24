import { z } from 'zod';
import { DateTimeStringSchema } from './shared';

export const UpdateFirmwareRequestSchema = z.object({
  location: z.string().url(),
  retries: z.number().int().optional(),
  retrieveDate: DateTimeStringSchema,
  retryInterval: z.number().int().optional(),
}).strict();
export type UpdateFirmwareRequest = z.infer<typeof UpdateFirmwareRequestSchema>;
