import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ResetEnumSchema = z.enum(["Immediate","OnIdle"]);

export const ResetRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "type": ResetEnumSchema,
  "evseId": z.number().int().optional()
}).strict();
export type ResetRequest = z.infer<typeof ResetRequestSchema>;
