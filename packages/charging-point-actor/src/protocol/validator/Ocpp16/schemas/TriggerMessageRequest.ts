import { z } from 'zod';

export const TriggerMessageRequestSchema = z.object({
  requestedMessage: z.enum([
    'BootNotification', 'DiagnosticsStatusNotification', 'FirmwareStatusNotification',
    'Heartbeat', 'MeterValues', 'StatusNotification',
  ]),
  connectorId: z.number().int().optional(),
}).strict();
export type TriggerMessageRequest = z.infer<typeof TriggerMessageRequestSchema>;
