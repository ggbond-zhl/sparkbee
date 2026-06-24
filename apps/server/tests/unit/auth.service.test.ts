import { describe, expect, test } from "vitest";

import { AuthService } from "../../src/services/auth.service";

describe("AuthService", () => {
  test("issues and verifies an admin session token", () => {
    const service = new AuthService("password-123", "x".repeat(32));

    const token = service.login("password-123");

    expect(token).toEqual(expect.any(String));
    expect(service.verify(token ?? undefined)).toMatchObject({
      subject: "admin"
    });
  });

  test("rejects invalid passwords and tampered tokens", () => {
    const service = new AuthService("password-123", "x".repeat(32));
    const token = service.login("password-123");

    expect(service.login("wrong-password")).toBeNull();
    expect(service.verify(`${token}tampered`)).toBeNull();
  });
});
