import { ModelError } from "../errors";
import {
  cloneArray,
  cloneDate as cloneSharedDate,
  cloneSet,
} from "../../shared/utils";
import { assertValidDate } from "./invariants";

export { cloneArray, cloneSet } from "../../shared/utils";

export function cloneDate(value: Date, fieldName: string = "date"): Date {
  assertValidDate(value, fieldName);
  return cloneSharedDate(value);
}

export function cloneNullableDate(
  value: Date | null,
  fieldName: string = "date",
): Date | null {
  return value === null ? null : cloneDate(value, fieldName);
}

export function cloneOptionalDate(
  value: Date | null | undefined,
  fieldName: string = "date",
): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return cloneNullableDate(value, fieldName);
}

export function buildUniqueMap<K, T>(
  values: Iterable<T> | undefined,
  selectKey: (value: T) => K,
  duplicateMessage: (key: K) => string,
): Map<K, T> {
  const map = new Map<K, T>();
  for (const value of values ?? []) {
    const key = selectKey(value);
    if (map.has(key)) {
      throw new ModelError("MODEL_DUPLICATE_RESOURCE", duplicateMessage(key));
    }

    map.set(key, value);
  }

  return map;
}
