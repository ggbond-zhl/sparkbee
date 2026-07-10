import type { ConnectorResponse } from "@spark-bee/contracts";

export const CONNECTOR_TYPE_OPTIONS = [
  { value: "GBT_AC", label: "国标交流" },
  { value: "GBT_DC", label: "国标直流" },
  { value: "IEC_62196_T2", label: "欧标交流 Type 2" },
  { value: "IEC_62196_T2_COMBO", label: "欧标直流 CCS2" },
  { value: "IEC_62196_T1", label: "美标交流 Type 1 / J1772" },
  { value: "IEC_62196_T1_COMBO", label: "美标直流 CCS1" },
  { value: "CHADEMO", label: "日标直流" },
  { value: "SAE_J3400", label: "北美 NACS" },
] satisfies Array<{ value: ConnectorResponse["type"]; label: string }>;

export const CONNECTOR_FORMAT_OPTIONS = [
  { value: "socket", label: "插座型" },
  { value: "cable", label: "线缆型" },
  { value: "unknown", label: "未知形态" },
] satisfies Array<{ value: ConnectorResponse["format"]; label: string }>;

export const CONNECTOR_POWER_TYPE_OPTIONS = [
  { value: "ac", label: "交流" },
  { value: "dc", label: "直流" },
  { value: "unknown", label: "未知供电" },
] satisfies Array<{ value: ConnectorResponse["powerType"]; label: string }>;

export function formatConnectorType(type: ConnectorResponse["type"]) {
  return (
    CONNECTOR_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    type
  );
}

export function formatConnectorFormat(format: ConnectorResponse["format"]) {
  return (
    CONNECTOR_FORMAT_OPTIONS.find((option) => option.value === format)?.label ??
    "未知形态"
  );
}

export function formatConnectorPowerType(
  powerType: ConnectorResponse["powerType"],
) {
  return (
    CONNECTOR_POWER_TYPE_OPTIONS.find((option) => option.value === powerType)
      ?.label ?? "未知供电"
  );
}
