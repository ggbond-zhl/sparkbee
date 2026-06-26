import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const MessageTriggerEnumSchema = z.enum(["BootNotification","LogStatusNotification","FirmwareStatusNotification","Heartbeat","MeterValues","SignChargingStationCertificate","SignV2GCertificate","StatusNotification","TransactionEvent","SignCombinedCertificate","PublishFirmwareStatusNotification"]);

const EVSESchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "connectorId": z.number().int().optional()
}).strict();

export const TriggerMessageRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evse": EVSESchema.optional(),
  "requestedMessage": MessageTriggerEnumSchema
}).strict();
export type TriggerMessageRequest = z.infer<typeof TriggerMessageRequestSchema>;
