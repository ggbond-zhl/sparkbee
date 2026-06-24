import { z } from 'zod';

export const UnlockConnectorRequestSchema = z.object({
  connectorId: z.number().int(),
}).strict();
export type UnlockConnectorRequest = z.infer<typeof UnlockConnectorRequestSchema>;
