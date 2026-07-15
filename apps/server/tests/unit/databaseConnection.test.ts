import { describe, expect, test, vi } from "vitest";

import type { ServerDatabase } from "../../src/db";
import {
  DatabaseConnectionTimeoutError,
  verifyDatabaseConnection,
} from "../../src/db/connection";

describe("verifyDatabaseConnection", () => {
  test("resolves when the database probe succeeds", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const database = { execute } as unknown as ServerDatabase;

    await expect(verifyDatabaseConnection(database)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledOnce();
  });

  test("preserves the database error when the probe fails", async () => {
    const connectionError = new Error("connection refused");
    const database = {
      execute: vi.fn().mockRejectedValue(connectionError),
    } as unknown as ServerDatabase;

    await expect(verifyDatabaseConnection(database)).rejects.toBe(connectionError);
  });

  test("rejects with a clear error when the probe times out", async () => {
    vi.useFakeTimers();
    const database = {
      execute: vi.fn().mockReturnValue(new Promise(() => {})),
    } as unknown as ServerDatabase;

    const verification = verifyDatabaseConnection(database, { timeoutMs: 5_000 });
    const rejection = expect(verification).rejects.toEqual(
      new DatabaseConnectionTimeoutError(5_000),
    );
    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    vi.useRealTimers();
  });
});
