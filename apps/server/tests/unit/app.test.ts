import { describe, expect, test } from "vitest";

import { createApp } from "../../src/app";

describe("createApp", () => {
  test("serves the health check from the backend skeleton", async () => {
    const app = createApp();

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  test("adds a request id response header", async () => {
    const app = createApp();

    const response = await app.request("/health");

    expect(response.headers.get("X-Request-Id")).toMatch(/^[\w=-]+$/);
  });

  test("reuses a valid request id from the request header", async () => {
    const app = createApp();

    const response = await app.request("/health", {
      headers: { "X-Request-Id": "manual-request-1" },
    });

    expect(response.headers.get("X-Request-Id")).toBe("manual-request-1");
  });

  test("serves the OpenAPI document", async () => {
    const app = createApp();

    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document).toMatchObject({
      openapi: "3.1.0",
      info: {
        title: "SparkBee API",
        version: "0.0.1",
      },
    });
    expect(document.paths).toHaveProperty("/health");
  });

  test("documents the health check in Chinese", async () => {
    const app = createApp();

    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);
    const document = await response.json();
    const healthOperation = document.paths["/health"].get;
    expect(healthOperation.summary).toBe("健康检查");
    expect(healthOperation.description).toBe("检查后端服务是否正常响应。");
    expect(healthOperation.responses["200"].description).toBe("后端服务正常。");
    expect(
      healthOperation.responses["200"].content["application/json"].schema.properties.status
        .description,
    ).toBe("服务健康状态。");
  });

  test("serves the Scalar API reference", async () => {
    const app = createApp();

    const response = await app.request("/docs");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("/openapi.json");
  });

  test("does not expose business API routes", async () => {
    const app = createApp();

    const response = await app.request("/api/chargingPoints");

    expect(response.status).toBe(404);
  });
});
