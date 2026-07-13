export const KEEPALIVE_TIMEOUT_MS = 90_000;

type Fetcher = typeof fetch;
type Clock = () => number;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runKeepalive(
  environment: Env,
  fetcher: Fetcher = fetch,
  now: Clock = Date.now,
): Promise<void> {
  const startedAt = now();
  let status: number | undefined;

  try {
    const response = await fetcher(environment.HEALTH_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(KEEPALIVE_TIMEOUT_MS),
    });
    status = response.status;

    if (!response.ok) {
      throw new Error(`健康检查返回 ${response.status}`);
    }

    console.info({
      durationMs: now() - startedAt,
      event: "test_environment_keepalive_succeeded",
      healthUrl: environment.HEALTH_URL,
      status,
    });
  } catch (error) {
    console.error({
      durationMs: now() - startedAt,
      error: getErrorMessage(error),
      event: "test_environment_keepalive_failed",
      healthUrl: environment.HEALTH_URL,
      ...(status === undefined ? {} : { status }),
    });
    throw error;
  }
}

export default {
  async scheduled(
    _controller: unknown,
    environment: Env,
    _context: unknown,
  ): Promise<void> {
    await runKeepalive(environment);
  },
};
