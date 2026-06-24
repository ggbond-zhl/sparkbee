import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const BootReasonEnumSchema = z.enum(["ApplicationReset","FirmwareUpdate","LocalReset","PowerUp","RemoteReset","ScheduledReset","Triggered","Unknown","Watchdog"]);

const ModemSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "iccid": z.string().max(20).optional(),
  "imsi": z.string().max(20).optional()
}).strict();

const ChargingStationSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "serialNumber": z.string().max(25).optional(),
  "model": z.string().max(20),
  "modem": ModemSchema.optional(),
  "vendorName": z.string().max(50),
  "firmwareVersion": z.string().max(50).optional()
}).strict();

export const BootNotificationRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "chargingStation": ChargingStationSchema,
  "reason": BootReasonEnumSchema
}).strict();
export type BootNotificationRequest = z.infer<typeof BootNotificationRequestSchema>;
