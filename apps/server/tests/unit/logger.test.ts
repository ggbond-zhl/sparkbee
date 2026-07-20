import { Writable } from "node:stream";

import { describe, expect, test } from "vitest";

import { createServerLogger } from "../../src/config/logger";

describe("createServerLogger", () => {
  test("生产环境输出结构化日志并遮盖敏感字段", () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = createServerLogger({
      environment: "production",
      level: "info",
      destination,
    });

    logger.info({
      event: "server.started",
      password: "password-value",
      nested: { token: "token-value" },
    }, "Server started");

    const record = JSON.parse(lines.join(""));
    expect(record).toMatchObject({
      level: 30,
      event: "server.started",
      password: "[Redacted]",
      nested: { token: "[Redacted]" },
      msg: "Server started",
    });
  });

  test("开发环境输出易读文本", async () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = createServerLogger({
      environment: "development",
      level: "debug",
      destination,
    });

    logger.info({ event: "server.started" }, "Server started");
    await new Promise((resolve) => setImmediate(resolve));

    const output = lines.join("");
    expect(output.trimStart().startsWith("{")).toBe(false);
    expect(output).toContain("INFO");
    expect(output).toContain("Server started");
  });
});
