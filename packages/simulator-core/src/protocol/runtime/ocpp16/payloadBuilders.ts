import type { Ocpp16RequestOf } from "../../validator/Ocpp16";

export interface MeterValueElectricalMeasurements {
  powerW: number;
  currentA: number;
  voltageV: number;
}

export function createMeterValue(
  meterWh: number,
  at: Date,
  context: "Transaction.Begin" | "Sample.Periodic" | "Transaction.End" | "Trigger",
  measurements?: MeterValueElectricalMeasurements,
): Ocpp16RequestOf<"MeterValues">["meterValue"][number] {
  return {
    timestamp: toOcppDate(at),
    sampledValue: [
      {
        value: formatSampledValue(meterWh),
        context,
        measurand: "Energy.Active.Import.Register",
        unit: "Wh",
      },
      ...createElectricalSampledValues(context, measurements),
    ],
  };
}

function createElectricalSampledValues(
  context: "Transaction.Begin" | "Sample.Periodic" | "Transaction.End" | "Trigger",
  measurements: MeterValueElectricalMeasurements | undefined,
): Ocpp16RequestOf<"MeterValues">["meterValue"][number]["sampledValue"] {
  if (measurements === undefined) {
    return [];
  }

  return [
    {
      value: formatSampledValue(measurements.powerW),
      context,
      measurand: "Power.Active.Import",
      unit: "W",
    },
    {
      value: formatSampledValue(measurements.currentA),
      context,
      measurand: "Current.Import",
      unit: "A",
    },
    {
      value: formatSampledValue(measurements.voltageV),
      context,
      measurand: "Voltage",
      unit: "V",
    },
  ];
}

function formatSampledValue(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export function createStopTransactionPayload(
  input: {
    ocppTransactionId: number;
    meterStop: number;
    timestamp: Date;
    reason: string | null;
    idTag: string | null;
    transactionData: Ocpp16RequestOf<"StopTransaction">["transactionData"];
  },
): Ocpp16RequestOf<"StopTransaction"> {
  const payload: Ocpp16RequestOf<"StopTransaction"> = {
    idTag: input.idTag ?? undefined,
    meterStop: input.meterStop,
    timestamp: toOcppDate(input.timestamp),
    transactionId: input.ocppTransactionId,
    transactionData: input.transactionData,
  };
  if (input.reason !== null) {
    payload.reason = input.reason as Ocpp16RequestOf<"StopTransaction">["reason"];
  }

  return payload;
}

export function toOcppDate(value: Date): string {
  return value.toISOString();
}
