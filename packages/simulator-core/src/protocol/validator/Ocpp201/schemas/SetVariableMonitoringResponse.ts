import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const MonitorEnumSchema = z.enum(["UpperThreshold","LowerThreshold","Delta","Periodic","PeriodicClockAligned"]);

const SetMonitoringStatusEnumSchema = z.enum(["Accepted","UnknownComponent","UnknownVariable","UnsupportedMonitorType","Rejected","Duplicate"]);

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

const StatusInfoSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "reasonCode": z.string().max(20),
  "additionalInfo": z.string().max(512).optional()
}).strict();

const VariableSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "name": z.string().max(50),
  "instance": z.string().max(50).optional()
}).strict();

const SetMonitoringResultSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "id": z.number().int().optional(),
  "statusInfo": StatusInfoSchema.optional(),
  "status": SetMonitoringStatusEnumSchema,
  "type": MonitorEnumSchema,
  "component": ComponentSchema,
  "variable": VariableSchema,
  "severity": z.number().int()
}).strict();

export const SetVariableMonitoringResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "setMonitoringResult": z.array(SetMonitoringResultSchema).min(1)
}).strict();
export type SetVariableMonitoringResponse = z.infer<typeof SetVariableMonitoringResponseSchema>;
