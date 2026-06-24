/**
 * 等待一段时间
 *
 * @param ms 等待时长，单位毫秒
 * @returns 到达指定时间后 resolve
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}

export function cloneNullableDate(value: Date | null): Date | null {
  return value === null ? null : cloneDate(value);
}

export function cloneOptionalDate(
  value: Date | null | undefined,
): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return cloneNullableDate(value);
}

export function cloneArray<T>(values: Iterable<T> | undefined): T[] {
  return values === undefined ? [] : [...values];
}

export function cloneSet<T>(values: Iterable<T> | undefined): Set<T> {
  return new Set(values ?? []);
}
