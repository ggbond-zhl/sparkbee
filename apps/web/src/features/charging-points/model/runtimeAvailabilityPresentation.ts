import type { RuntimeAvailability } from "@spark-bee/contracts";

export interface RuntimeAvailabilityView {
  currentAvailability: RuntimeAvailability;
  requestedAvailability?: RuntimeAvailability;
}

export function formatRuntimeAvailabilityDetail(
  availability: RuntimeAvailabilityView,
) {
  const currentLabel = formatRuntimeAvailability(availability.currentAvailability);
  return availability.requestedAvailability === undefined
    ? currentLabel
    : `${currentLabel} · 待切换为${formatRuntimeAvailability(
        availability.requestedAvailability,
      )}`;
}

export function formatRuntimeAvailability(availability: RuntimeAvailability) {
  return availability === "operative" ? "可用" : "不可用";
}

export function toRuntimeAvailabilityTone(availability: RuntimeAvailability) {
  return availability === "operative"
    ? "success" as const
    : "warning" as const;
}
