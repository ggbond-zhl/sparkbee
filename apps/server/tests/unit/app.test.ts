import { describe, expect, test } from "vitest";

import { createApp } from "../../src/app";
import { AuthService } from "../../src/services/auth.service";
import type { Services } from "../../src/services";

function createTestApp() {
  const services = {
    auth: new AuthService("password-123", "x".repeat(32)),
    events: {
      subscribe: () => () => undefined,
      listByStation: async () => []
    },
    stations: {
      listStations: async () => []
    }
  } as unknown as Services;

  return createApp(services);
}

describe("createApp", () => {
  test("protects API routes until login succeeds", async () => {
    const app = createTestApp();

    const rejected = await app.request("/api/stations");
    expect(rejected.status).toBe(401);

    const login = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "password-123" }),
      headers: { "Content-Type": "application/json" }
    });

    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie");
    expect(cookie).toContain("sparkbee_session=");

    const accepted = await app.request("/api/stations", {
      headers: { cookie: cookie ?? "" }
    });
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toEqual({ data: [] });
  });
});
