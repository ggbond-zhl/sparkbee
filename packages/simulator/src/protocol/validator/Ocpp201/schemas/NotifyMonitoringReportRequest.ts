import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const MonitorEnumSchema = z.enum(["UpperThreshold","LowerThreshold","Delta","Periodic","PeriodicClockAligned"]);

const EVSESchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "connectorId": z.number().int().optional()
}).strict();

const ComponentSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "evse": EVSESchema.optional(),
  "name": z.string().max(50),
  "instance": z.string().max(50).optional()
}).strict();

const VariableSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "name": z.string().max(50),
  "instance": z.string().max(50).optional()
}).strict();

const VariableMonitoringSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int(),
  "transaction": z.boolean(),
  "value": z.number(),
  "type": MonitorEnumSchema,
  "severity": z.number().int()
}).strict();

const MonitoringDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "component": ComponentSchema,
  "variable": VariableSchema,
  "variableMonitoring": z.array(VariableMonitoringSchema).min(1)
}).strict();

export const NotifyMonitoringReportRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "monitor": z.array(MonitoringDataSchema).min(1).optional(),
  "requestId": z.number().int(),
  "tbc": z.boolean().optional(),
  "seqNo": z.number().int(),
  "generatedAt": z.string().datetime({ offset: true })
}).strict();
export type NotifyMonitoringReportRequest = z.infer<typeof NotifyMonitoringReportRequestSchema>;
