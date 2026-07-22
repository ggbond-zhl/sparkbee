import {
  createConnectorRequestSchema,
  type CreateConnectorRequest,
} from "@spark-bee/contracts";
import { z } from "zod";

const positiveIntegerInput = z
  .string()
  .trim()
  .transform((value) => Number(value))
  .pipe(z.number().int().positive());

const requiredNonNegativeIntegerInput = z
  .string()
  .trim()
  .min(1)
  .transform((value) => Number(value))
  .pipe(z.number().int().nonnegative());

export const connectorManagementFormSchema = z
  .object({
    connectorId: positiveIntegerInput,
    type: createConnectorRequestSchema.shape.type,
    powerType: createConnectorRequestSchema.shape.powerType,
    maxVoltage: requiredNonNegativeIntegerInput,
    maxCurrent: requiredNonNegativeIntegerInput,
  })
  .transform(
    (values): CreateConnectorRequest => ({
      ...values,
      evseId: values.connectorId,
      format: "cable",
    }),
  );

export type ConnectorManagementFormInput = z.input<
  typeof connectorManagementFormSchema
>;
export type ConnectorManagementFormValues = CreateConnectorRequest;

export const connectorManagementFormDefaultValues = {
  connectorId: "1",
  type: "IEC_62196_T2",
  powerType: "ac",
  maxVoltage: "230",
  maxCurrent: "32",
} satisfies ConnectorManagementFormInput;
