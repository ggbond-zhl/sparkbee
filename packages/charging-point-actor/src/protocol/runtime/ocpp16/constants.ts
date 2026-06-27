export const OCPP16_ERROR_CODES = new Set<string>([
  "ConnectorLockFailure",
  "EVCommunicationError",
  "GroundFailure",
  "HighTemperature",
  "InternalError",
  "LocalListConflict",
  "NoError",
  "OtherError",
  "OverCurrentFailure",
  "PowerMeterFailure",
  "PowerSwitchFailure",
  "ReaderFailure",
  "ResetFailure",
  "UnderVoltage",
  "OverVoltage",
  "WeakSignal",
]);

export const OCPP16_AUTHORIZATION_STATUSES = new Set<string>([
  "Accepted",
  "Blocked",
  "Expired",
  "Invalid",
  "ConcurrentTx",
]);

export const DEFAULT_HEARTBEAT_UNSTABLE_THRESHOLD = 2;
export const DEFAULT_HEARTBEAT_RECONNECT_THRESHOLD = 3;
export const DEFAULT_HEARTBEAT_TIME_DRIFT_THRESHOLD_MS = 300_000;

export function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${name} 必须是大于 0 的整数`);
  }

  return resolved;
}

export function normalizeNullableNonNegativeInteger(
  value: number | null | undefined,
  fallback: number,
  name: string,
): number | null {
  if (value === null) {
    return null;
  }

  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new Error(`${name} 必须是非负整数或 null`);
  }

  return resolved;
}
