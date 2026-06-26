import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const ConnectorStatusEnumSchema = z.enum(["Available","Occupied","Reserved","Unavailable","Faulted"]);

export const StatusNotificationRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "timestamp": z.string().datetime({ offset: true }),
  "connectorStatus": ConnectorStatusEnumSchema,
  "evseId": z.number().int(),
  "connectorId": z.number().int()
}).strict();
export type StatusNotificationRequest = z.infer<typeof StatusNotificationRequestSchema>;
