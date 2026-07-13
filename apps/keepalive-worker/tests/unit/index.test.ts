import { afterEach, describe, expect, it, vi } from "vitest";

import worker, {
  KEEPALIVE_TIMEOUT_MS,
  runKeepalive,
} from "../../src/index";

const environment = {
  HEALTH_URL: "https://sparkbee-test-api.onrender.com/api/health",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("runKeepalive", () => {
  it("访问配置的健康接口并记录成功日志", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_123);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await runKeepalive(environment, fetcher, now);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(environment.HEALTH_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      method: "GET",
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    expect(KEEPALIVE_TIMEOUT_MS).toBe(90_000);
    expect(info).toHaveBeenCalledWith({
      durationMs: 123,
      event: "test_environment_keepalive_succeeded",
      healthUrl: environment.HEALTH_URL,
      status: 204,
    });
  });

  it("非 2xx 响应会记录失败并结束本次执行", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_250);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runKeepalive(environment, fetcher, now)).rejects.toThrow(
      "健康检查返回 503",
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith({
      durationMs: 250,
      error: "健康检查返回 503",
      event: "test_environment_keepalive_failed",
      healthUrl: environment.HEALTH_URL,
      status: 503,
    });
  });

  it("网络错误会记录失败且不立即重试", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network unavailable"));
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_010);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runKeepalive(environment, fetcher, now)).rejects.toThrow(
      "network unavailable",
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith({
      durationMs: 10,
      error: "network unavailable",
      event: "test_environment_keepalive_failed",
      healthUrl: environment.HEALTH_URL,
    });
  });
});

describe("scheduled", () => {
  it("由 Cron 触发保活请求", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await worker.scheduled(
      {},
      environment,
      {},
    );

    expect(fetcher).toHaveBeenCalledOnce();
  });
});
