import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const RegistrationStatusEnumSchema = z.enum(["Accepted","Pending","Rejected"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const BootNotificationResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "currentTime": z.string().datetime({ offset: true }),
  "interval": z.number().int(),
  "status": RegistrationStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional()
}).strict();
export type BootNotificationResponse = z.infer<typeof BootNotificationResponseSchema>;
