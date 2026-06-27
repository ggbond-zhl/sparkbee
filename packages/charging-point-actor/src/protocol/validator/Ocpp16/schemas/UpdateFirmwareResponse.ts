import { z } from 'zod';

export const UpdateFirmwareResponseSchema = z.object({}).strict();
export type UpdateFirmwareResponse = z.infer<typeof UpdateFirmwareResponseSchema>;
