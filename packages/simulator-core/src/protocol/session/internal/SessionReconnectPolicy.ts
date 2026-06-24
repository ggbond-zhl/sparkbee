import type { ReconnectOptions } from "../types";

const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 60_000;

/** 纯粹负责重连延迟和重试上限的计算。 */
export class SessionReconnectPolicy {
  constructor(
    private readonly options: ReconnectOptions | undefined,
    private readonly random: () => number = Math.random,
  ) {}

  getDelayMs(attempt: number): number {
    const initialDelayMs =
      this.options?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    const maxDelayMs = this.options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    const delayMs = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
    const jitterEnabled = this.options?.jitter ?? true;

    if (!jitterEnabled) {
      return delayMs;
    }

    return Math.floor(this.random() * delayMs);
  }

  getMaxRetries(): number {
    return this.options?.maxRetries ?? Number.POSITIVE_INFINITY;
  }
}
