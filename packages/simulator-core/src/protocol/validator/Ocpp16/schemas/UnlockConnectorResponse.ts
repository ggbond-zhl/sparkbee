import { z } from 'zod';

export const UnlockConnectorResponseSchema = z.object({
  status: z.enum(['Unlocked', 'UnlockFailed', 'NotSupported']),
}).strict();
export type UnlockConnectorResponse = z.infer<typeof UnlockConnectorResponseSchema>;
