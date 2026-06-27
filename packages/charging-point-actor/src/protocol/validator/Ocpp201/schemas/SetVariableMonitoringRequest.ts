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

const SetMonitoringDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int().optional(),
  "transaction": z.boolean().optional(),
  "value": z.number(),
  "type": MonitorEnumSchema,
  "severity": z.number().int(),
  "component": ComponentSchema,
  "variable": VariableSchema
}).strict();

export const SetVariableMonitoringRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "setMonitoringData": z.array(SetMonitoringDataSchema).min(1)
}).strict();
export type SetVariableMonitoringRequest = z.infer<typeof SetVariableMonitoringRequestSchema>;
