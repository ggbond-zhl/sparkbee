import { describe, expect, test, vi } from "vitest";

import { BestEffortBatchWriter } from "../../src/lib/bestEffortBatchWriter";

describe("best-effort 批处理 module", () => {
  test("达到批量大小时写入一次并保留入队顺序", async () => {
    const persistBatch = vi.fn(async () => undefined);
    const writer = new BestEffortBatchWriter<number>({
      batchSize: 2,
      persistBatch,
    });

    writer.enqueue(1);
    writer.enqueue(2);
    await writer.flush();

    expect(persistBatch).toHaveBeenCalledTimes(1);
    expect(persistBatch).toHaveBeenCalledWith([1, 2]);
  });

  test("首次失败后重试一次并吞掉最终失败", async () => {
    const failure = new Error("database unavailable");
    const persistBatch = vi.fn(() => Promise.reject(failure));
    const onFailed = vi.fn();
    const writer = new BestEffortBatchWriter<number>({
      persistBatch,
      onFailed,
    });

    writer.enqueue(1);
    await expect(writer.flush()).resolves.toBeUndefined();

    expect(persistBatch).toHaveBeenCalledTimes(2);
    expect(onFailed).toHaveBeenCalledWith(failure, [1]);
  });
});
