import { Writable } from "node:stream";

import { afterEach, describe, expect, test, vi } from "vitest";

import { createApp } from "../../src/app";
import { createServerLogger } from "../../src/config/logger";
import type { ServerDatabase } from "../../src/db";
import { AppError } from "../../src/utils/errors";
import { createTestDatabase } from "../support/testDatabase";

describe("createApp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("serves the health check from the backend skeleton", async () => {
    const app = createApp();

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  test("does not expose the health check without the API prefix", async () => {
    const app = createApp();

    const response = await app.request("/health");

    expect(response.status).toBe(404);
  });

  test("reports ready when the database is available", async () => {
    const database = await createTestDatabase();
    const app = createApp({ database });

    const response = await app.request("/api/ready");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  test("reports unavailable when the database is not configured", async () => {
    const app = createApp();

    const response = await app.request("/api/ready");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });

  test("reports unavailable when the database probe fails", async () => {
    const database = {
      execute: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as unknown as ServerDatabase;
    const app = createApp({ database });

    const response = await app.request("/api/ready");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });

  test("reports unavailable when the database probe times out", async () => {
    vi.useFakeTimers();
    const database = {
      execute: vi.fn().mockReturnValue(new Promise(() => {})),
    } as unknown as ServerDatabase;
    const app = createApp({ database });

    const responsePromise = app.request("/api/ready");
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await responsePromise;

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    vi.useRealTimers();
  });

  test("adds a request id response header", async () => {
    const app = createApp();

    const response = await app.request("/api/health");

    expect(response.headers.get("X-Request-Id")).toMatch(/^[\w=-]+$/);
  });

  test("logs client errors at warn level", async () => {
    const lines: string[] = [];
    const logger = createServerLogger({
      environment: "production",
      level: "info",
      destination: new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString());
          callback();
        },
      }),
    });
    const app = createApp({ environment: "production", logger });

    const response = await app.request("/missing");

    expect(response.status).toBe(404);
    expect(JSON.parse(lines.join(""))).toMatchObject({
      level: 40,
      event: "http.request.completed",
      path: "/missing",
      status: 404,
    });
  });

  test("logs request metadata without sensitive request data", async () => {
    const lines: string[] = [];
    const logger = createServerLogger({
      environment: "production",
      level: "debug",
      destination: new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString());
          callback();
        },
      }),
    });
    const app = createApp({ environment: "production", logger });

    const response = await app.request("/api/health?token=secret-query", {
      headers: {
        Authorization: "Bearer secret-token",
        Cookie: "session=secret-cookie",
        "X-Request-Id": "request-123",
      },
    });

    expect(response.status).toBe(200);
    const record = JSON.parse(lines.join(""));
    expect(record).toMatchObject({
      level: 30,
      event: "http.request.completed",
      requestId: "request-123",
      method: "GET",
      path: "/api/health",
      status: 200,
    });
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(lines.join("")).not.toContain("secret-query");
    expect(lines.join("")).not.toContain("secret-token");
    expect(lines.join("")).not.toContain("secret-cookie");
  });

  test("reports unexpected server errors with request context", async () => {
    const lines: string[] = [];
    const captured: Array<{ error: unknown; context: Record<string, unknown> }> = [];
    const logger = createServerLogger({
      environment: "production",
      level: "debug",
      destination: new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString());
          callback();
        },
      }),
    });
    const app = createApp({
      environment: "production",
      logger,
      errorReporter: {
        captureException(error, context) {
          captured.push({ error, context });
        },
      },
    });
    const failure = new Error("controlled failure");
    app.get("/failure", () => {
      throw failure;
    });

    const response = await app.request("/failure", {
      headers: { "X-Request-Id": "request-500" },
    });

    expect(response.status).toBe(500);
    expect(captured).toEqual([{
      error: failure,
      context: {
        requestId: "request-500",
        method: "GET",
        path: "/failure",
        module: "http",
      },
    }]);
    const records = lines.join("").trim().split("\n").map((line) => JSON.parse(line));
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "http.request.failed",
        requestId: "request-500",
        method: "GET",
        path: "/failure",
        error: expect.objectContaining({ message: "controlled failure" }),
      }),
      expect.objectContaining({
        event: "http.request.completed",
        requestId: "request-500",
        status: 500,
      }),
    ]));
  });

  test("does not report expected application errors", async () => {
    const captured: unknown[] = [];
    const app = createApp({
      environment: "production",
      errorReporter: {
        captureException(error) {
          captured.push(error);
        },
      },
    });
    app.get("/expected-failure", () => {
      throw new AppError(409, "EXPECTED_CONFLICT", "Expected conflict");
    });

    const response = await app.request("/expected-failure");

    expect(response.status).toBe(409);
    expect(captured).toEqual([]);
  });

  test("adds secure response headers", async () => {
    const app = createApp();

    const response = await app.request("/api/health");

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  test("handles CORS preflight requests", async () => {
    const app = createApp();

    const response = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "GET",
        Origin: "http://localhost:3001",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3001",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  test("restricts CORS responses to the configured web origin", async () => {
    const app = createApp({
      corsAllowedOrigin: "https://sparkbee-test-web.pages.dev",
    });

    const response = await app.request("/api/health", {
      headers: {
        Origin: "https://sparkbee-test-web.pages.dev",
      },
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://sparkbee-test-web.pages.dev",
    );
  });

  test("compresses large compressible responses in production", async () => {
    const app = createApp({ environment: "production" });
    app.get("/large-response", (context) => context.text("x".repeat(2048)));

    const response = await app.request("/large-response", {
      headers: { "Accept-Encoding": "gzip" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Encoding")).toBe("gzip");
  });

  test("does not compress responses outside production", async () => {
    const app = createApp({ environment: "test" });
    app.get("/large-response", (context) => context.text("x".repeat(2048)));

    const response = await app.request("/large-response", {
      headers: { "Accept-Encoding": "gzip" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Encoding")).toBeNull();
  });

  test("returns gateway timeout when a request exceeds the timeout", async () => {
    const app = createApp({ timeoutMs: 1 });
    app.get("/slow-response", async (context) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return context.json({ status: "late" });
    });

    const response = await app.request("/slow-response");

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "GATEWAY_TIMEOUT",
        message: "Gateway Timeout",
      },
    });
  });

  test("reuses a valid request id from the request header", async () => {
    const app = createApp();

    const response = await app.request("/api/health", {
      headers: { "X-Request-Id": "manual-request-1" },
    });

    expect(response.headers.get("X-Request-Id")).toBe("manual-request-1");
  });

  test("serves the OpenAPI document", async () => {
    const app = createApp();

    const response = await app.request("/api/openapi.json");

    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document).toMatchObject({
      openapi: "3.1.0",
      info: {
        title: "SparkBee API",
        version: "0.0.1",
      },
    });
    expect(document.paths).toHaveProperty("/api/health");
    expect(document.paths).toHaveProperty("/api/ready");
  });

  test("documents the health check in Chinese", async () => {
    const app = createApp();

    const response = await app.request("/api/openapi.json");

    expect(response.status).toBe(200);
    const document = await response.json();
    const healthOperation = document.paths["/api/health"].get;
    expect(healthOperation.summary).toBe("健康检查");
    expect(healthOperation.description).toBe("检查后端服务是否正常响应。");
    expect(healthOperation.responses["200"].description).toBe("后端服务正常。");
    expect(
      healthOperation.responses["200"].content["application/json"].schema.properties.status
        .description,
    ).toBe("服务健康状态。");
  });

  test("documents the readiness check in Chinese", async () => {
    const app = createApp();

    const response = await app.request("/api/openapi.json");

    expect(response.status).toBe(200);
    const document = await response.json();
    const readinessOperation = document.paths["/api/ready"].get;
    expect(readinessOperation.summary).toBe("就绪检查");
    expect(readinessOperation.description).toBe(
      "检查后端服务是否能够连接数据库并处理业务请求。",
    );
    expect(readinessOperation.responses["200"].description).toBe(
      "后端服务及数据库已就绪。",
    );
    expect(readinessOperation.responses["503"].description).toBe(
      "后端服务尚未就绪。",
    );
  });

  test("serves the Scalar API reference", async () => {
    const app = createApp();

    const response = await app.request("/api/docs");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("/api/openapi.json");
  });

  test("does not expose business API routes", async () => {
    const app = createApp();

    const response = await app.request("/api/charging-points");

    expect(response.status).toBe(404);
  });
});
