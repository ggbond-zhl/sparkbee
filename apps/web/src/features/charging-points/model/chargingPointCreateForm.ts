import {
  createChargingPointRequestSchema,
  type CreateChargingPointRequest,
} from "@spark-bee/contracts";
import type { z } from "zod";

export const chargingPointCreateFormSchema = createChargingPointRequestSchema;

export type ChargingPointCreateFormInput = z.input<
  typeof chargingPointCreateFormSchema
>;
export type ChargingPointCreateFormValues = CreateChargingPointRequest;

export const chargingPointCreateFormDefaultValues = {
  name: "",
  description: "",
  identity: "",
  protocol: "OCPP16J",
  centralSystemUrl: "",
  vendor: "",
  model: "",
  firmwareVersion: "",
  serialNumber: "",
} satisfies ChargingPointCreateFormInput;
