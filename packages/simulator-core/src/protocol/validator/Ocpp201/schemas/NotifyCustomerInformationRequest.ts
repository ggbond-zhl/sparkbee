import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

export const NotifyCustomerInformationRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "data": z.string().max(512),
  "tbc": z.boolean().optional(),
  "seqNo": z.number().int(),
  "generatedAt": z.string().datetime({ offset: true }),
  "requestId": z.number().int()
}).strict();
export type NotifyCustomerInformationRequest = z.infer<typeof NotifyCustomerInformationRequestSchema>;
