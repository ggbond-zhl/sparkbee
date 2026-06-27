import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const DataTransferStatusEnumSchema = z.enum(["Accepted","Rejected","UnknownMessageId","UnknownVendorId"]);

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

export const DataTransferResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "status": DataTransferStatusEnumSchema,
  "statusInfo": StatusInfoSchema.optional(),
  "data": z.unknown().optional()
}).strict();
export type DataTransferResponse = z.infer<typeof DataTransferResponseSchema>;
