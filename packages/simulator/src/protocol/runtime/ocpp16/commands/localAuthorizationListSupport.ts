import type { Ocpp16RuntimeContext } from "../state";

export function supportsLocalAuthorizationList(
  context: Ocpp16RuntimeContext,
): boolean {
  return context.configurationStore.getValue("LocalAuthListEnabled") === "true" &&
    readPositiveIntegerConfig(context, "LocalAuthListMaxLength") !== null;
}

export function readPositiveIntegerConfig(
  context: Ocpp16RuntimeContext,
  key: string,
): number | null {
  const value = context.configurationStore.getValue(key);
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}
