import type { Logger } from "pino";
import { describe, expect, test, vi } from "vitest";

import type { ServerDatabase } from "../../src/db";
import { startServer } from "../../src/app";

describe("startServer", () => {
  test("starts listening only after the database is available", async () => {
    const calls: string[] = [];
    const database = {
      execute: vi.fn().mockImplementation(async () => {
        calls.push("database");
      }),
    } as unknown as ServerDatabase;
    const listen = vi.fn(() => calls.push("listen"));
    const onStarted = vi.fn(() => calls.push("started"));

    await startServer({
      database,
      errorReporter: { captureException: vi.fn() },
      listen,
      logger: { error: vi.fn() } as unknown as Logger,
      onStarted,
    });

    expect(calls).toEqual(["database", "listen", "started"]);
  });

  test("reports the error and does not listen when the database is unavailable", async () => {
    const connectionError = new Error("connection refused");
    const database = {
      execute: vi.fn().mockRejectedValue(connectionError),
    } as unknown as ServerDatabase;
    const captureException = vi.fn();
    const listen = vi.fn();
    const loggerError = vi.fn();
    const onStarted = vi.fn();

    await expect(startServer({
      database,
      errorReporter: { captureException },
      listen,
      logger: { error: loggerError } as unknown as Logger,
      onStarted,
    })).rejects.toBe(connectionError);

    expect(listen).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith({
      event: "database.connection.failed",
      error: connectionError,
    }, "数据库连接校验失败，服务启动已终止");
    expect(captureException).toHaveBeenCalledWith(connectionError, {
      module: "database.startup",
    });
  });
});
