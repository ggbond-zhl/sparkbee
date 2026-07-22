import {
  createChargingPointRequestSchema,
  type CreateChargingPointRequest,
} from "@spark-bee/contracts";
import type { z } from "zod";

export const chargingPointCreateFormSchema =
  createChargingPointRequestSchema.omit({ description: true });

export type ChargingPointCreateFormInput = z.input<
  typeof chargingPointCreateFormSchema
>;
export type ChargingPointCreateFormValues = CreateChargingPointRequest;

export const chargingPointCreateFormDefaultValues = {
  name: "",
  identity: "",
  protocol: "OCPP16J",
  centralSystemUrl: "",
  vendor: "",
  model: "",
  firmwareVersion: "",
  serialNumber: "",
} satisfies ChargingPointCreateFormInput;
