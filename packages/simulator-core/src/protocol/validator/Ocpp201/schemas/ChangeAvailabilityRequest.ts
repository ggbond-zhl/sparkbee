import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const OperationalStatusEnumSchema = z.enum(["Inoperative","Operative"]);

const EVSESchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "connectorId": z.number().int().optional()
}).strict();

export const ChangeAvailabilityRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evse": EVSESchema.optional(),
  "operationalStatus": OperationalStatusEnumSchema
}).strict();
export type ChangeAvailabilityRequest = z.infer<typeof ChangeAvailabilityRequestSchema>;
