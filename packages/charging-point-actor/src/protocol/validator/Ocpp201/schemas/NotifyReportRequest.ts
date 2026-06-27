import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const AttributeEnumSchema = z.enum(["Actual","Target","MinSet","MaxSet"]);

const DataEnumSchema = z.enum(["string","decimal","integer","dateTime","boolean","OptionList","SequenceList","MemberList"]);

const MutabilityEnumSchema = z.enum(["ReadOnly","WriteOnly","ReadWrite"]);

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

const VariableAttributeSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "type": AttributeEnumSchema.optional(),
  "value": z.string().max(2500).optional(),
  "mutability": MutabilityEnumSchema.optional(),
  "persistent": z.boolean().optional(),
  "constant": z.boolean().optional()
}).strict();

const VariableCharacteristicsSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "unit": z.string().max(16).optional(),
  "dataType": DataEnumSchema,
  "minLimit": z.number().optional(),
  "maxLimit": z.number().optional(),
  "valuesList": z.string().max(1000).optional(),
  "supportsMonitoring": z.boolean()
}).strict();

const ReportDataSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "component": ComponentSchema,
  "variable": VariableSchema,
  "variableAttribute": z.array(VariableAttributeSchema).min(1).max(4),
  "variableCharacteristics": VariableCharacteristicsSchema.optional()
}).strict();

export const NotifyReportRequestSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "requestId": z.number().int(),
  "generatedAt": z.string().datetime({ offset: true }),
  "reportData": z.array(ReportDataSchema).min(1).optional(),
  "tbc": z.boolean().optional(),
  "seqNo": z.number().int()
}).strict();
export type NotifyReportRequest = z.infer<typeof NotifyReportRequestSchema>;
