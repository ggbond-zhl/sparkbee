import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const MonitoringBaseEnumSchema = z.enum(["All","FactoryDefault","HardWiredOnly"]);

export const SetMonitoringBaseRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "monitoringBase": MonitoringBaseEnumSchema
}).strict();
export type SetMonitoringBaseRequest = z.infer<typeof SetMonitoringBaseRequestSchema>;
