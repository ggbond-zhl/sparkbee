import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const AttributeEnumSchema = z.enum(["Actual","Target","MinSet","MaxSet"]);

const GetVariableStatusEnumSchema = z.enum(["Accepted","Rejected","UnknownComponent","UnknownVariable","NotSupportedAttributeType"]);

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

const GetVariableResultSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "attributeStatusInfo": StatusInfoSchema.optional(),
  "attributeStatus": GetVariableStatusEnumSchema,
  "attributeType": AttributeEnumSchema.optional(),
  "attributeValue": z.string().max(2500).optional(),
  "component": ComponentSchema,
  "variable": VariableSchema
}).strict();

export const GetVariablesResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "getVariableResult": z.array(GetVariableResultSchema).min(1)
}).strict();
export type GetVariablesResponse = z.infer<typeof GetVariablesResponseSchema>;
