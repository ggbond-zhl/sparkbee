import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const GetLocalListVersionResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "versionNumber": z.number().int()
}).strict();
export type GetLocalListVersionResponse = z.infer<typeof GetLocalListVersionResponseSchema>;
