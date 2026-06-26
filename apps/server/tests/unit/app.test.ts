import { describe, expect, test } from "vitest";

import { createApp } from "../../src/app";

describe("createApp", () => {
  test("serves the health check from the backend skeleton", async () => {
    const app = createApp();

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  test("does not expose business API routes", async () => {
    const app = createApp();

    const response = await app.request("/api/chargingPoints");

    expect(response.status).toBe(404);
  });
});
