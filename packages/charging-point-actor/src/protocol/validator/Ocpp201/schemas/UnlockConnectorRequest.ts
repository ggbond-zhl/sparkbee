import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const UnlockConnectorRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evseId": z.number().int(),
  "connectorId": z.number().int()
}).strict();
export type UnlockConnectorRequest = z.infer<typeof UnlockConnectorRequestSchema>;
