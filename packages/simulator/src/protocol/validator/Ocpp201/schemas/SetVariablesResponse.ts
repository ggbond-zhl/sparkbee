import { z } from 'zod';

const CustomDataSchema = z.object({
  "vendorId": z.string().max(255)
}).catchall(z.unknown());

const AttributeEnumSchema = z.enum(["Actual","Target","MinSet","MaxSet"]);

const SetVariableStatusEnumSchema = z.enum(["Accepted","Rejected","UnknownComponent","UnknownVariable","NotSupportedAttributeType","RebootRequired"]);

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

const SetVariableResultSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "attributeType": AttributeEnumSchema.optional(),
  "attributeStatus": SetVariableStatusEnumSchema,
  "attributeStatusInfo": StatusInfoSchema.optional(),
  "component": ComponentSchema,
  "variable": VariableSchema
}).strict();

export const SetVariablesResponseSchema = z.object({
  "customData": CustomDataSchema.optional(),
  "setVariableResult": z.array(SetVariableResultSchema).min(1)
}).strict();
export type SetVariablesResponse = z.infer<typeof SetVariablesResponseSchema>;
