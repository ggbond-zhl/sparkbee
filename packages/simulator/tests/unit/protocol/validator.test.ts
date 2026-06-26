import { describe, expect, test } from "vitest";
import { z } from "zod";

import { Ocpp16Validator } from "../../../src/protocol/validator/Ocpp16/Ocpp16Validator.ts";
import type { Ocpp16RequestOf } from "../../../src/protocol/validator/Ocpp16/index.ts";
import { Ocpp201Validator } from "../../../src/protocol/validator/Ocpp201/Ocpp201Validator.ts";
import type { Ocpp201RequestOf } from "../../../src/protocol/validator/Ocpp201/index.ts";
import type { SchemaCatalog } from "../../../src/protocol/validator/catalog.ts";

const ocpp16BootNotificationRequest: Ocpp16RequestOf<"BootNotification"> = {
  chargePointVendor: "ACME",
  chargePointModel: "FastCharger",
};

const ocpp16MeterValuesRequest: Ocpp16RequestOf<"MeterValues"> = {
  connectorId: 1,
  meterValue: [
    {
      timestamp: "2025-01-01T00:00:00Z",
      sampledValue: [{ value: "12.3" }],
    },
  ],
};

const ocpp16SetChargingProfileRequest: Ocpp16RequestOf<"SetChargingProfile"> = {
  connectorId: 1,
  csChargingProfiles: {
    chargingProfileId: 1,
    stackLevel: 0,
    chargingProfilePurpose: "TxProfile",
    chargingProfileKind: "Absolute",
    chargingSchedule: {
      chargingRateUnit: "A",
      chargingSchedulePeriod: [
        {
          startPeriod: 0,
          limit: 16.1,
        },
      ],
    },
  },
};

const ocpp201BootNotificationRequest: Ocpp201RequestOf<"BootNotification"> = {
  chargingStation: {
    model: "FastCharger",
    vendorName: "ACME",
  },
  reason: "PowerUp",
};

describe("protocol validators", () => {
  test("validates OCPP16 BootNotification payloads", () => {
    const validator = new Ocpp16Validator();

    expect(
      validator.validate(
        "BootNotification",
        ocpp16BootNotificationRequest,
        "request",
      ),
    ).toEqual({ success: true });
  });

  test("validates OCPP201 BootNotification payloads", () => {
    const validator = new Ocpp201Validator();

    expect(
      validator.validate(
        "BootNotification",
        ocpp201BootNotificationRequest,
        "request",
      ),
    ).toEqual({ success: true });
  });

  test("allows non-standard OCPP16 StatusNotification response fields", () => {
    const validator = new Ocpp16Validator();

    expect(
      validator.validate("StatusNotification", { status: "Accepted" }, "response"),
    ).toEqual({ success: true });
  });

  test("allows non-standard OCPP16 MeterValues response fields", () => {
    const validator = new Ocpp16Validator();

    expect(
      validator.validate("MeterValues", { status: "Accepted" }, "response"),
    ).toEqual({ success: true });
  });

  test("allows standard and non-standard OCPP16 StopTransaction response fields", () => {
    const validator = new Ocpp16Validator();

    expect(
      validator.validate("StopTransaction", {}, "response"),
    ).toEqual({ success: true });
    expect(
      validator.validate(
        "StopTransaction",
        { idTagInfo: { status: "Expired" } },
        "response",
      ),
    ).toEqual({ success: true });
    expect(
      validator.validate("StopTransaction", { status: "Rejected" }, "response"),
    ).toEqual({ success: true });
  });

  test("returns UNKNOWN_ACTION issues for unregistered OCPP16 actions", () => {
    const validator = new Ocpp16Validator();

    expect(
      validator.validate("UnknownAction", {}, "request"),
    ).toEqual({
      success: false,
      issues: [
        {
          path: ["action"],
          message: "[OCPP16J] 未注册 UnknownAction.request schema",
          code: "UNKNOWN_ACTION",
        },
      ],
    });
  });

  test("maps zod issues for invalid OCPP16 payloads", () => {
    const validator = new Ocpp16Validator();
    const result = validator.validate("BootNotification", {}, "request");

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.issues[0]).toMatchObject({
      path: ["chargePointVendor"],
      code: "invalid_type",
    });
    expect(result.issues[0]?.message.length).toBeGreaterThan(0);
  });

  test("rejects empty OCPP16 meterValue arrays", () => {
    const validator = new Ocpp16Validator();
    const result = validator.validate(
      "MeterValues",
      {
        ...ocpp16MeterValuesRequest,
        meterValue: [],
      },
      "request",
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.issues[0]).toMatchObject({
      path: ["meterValue"],
      code: "too_small",
    });
  });

  test("rejects empty OCPP16 sampledValue arrays", () => {
    const validator = new Ocpp16Validator();
    const result = validator.validate(
      "MeterValues",
      {
        ...ocpp16MeterValuesRequest,
        meterValue: [
          {
            timestamp: "2025-01-01T00:00:00Z",
            sampledValue: [],
          },
        ],
      },
      "request",
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.issues[0]).toMatchObject({
      path: ["meterValue", 0, "sampledValue"],
      code: "too_small",
    });
  });

  test("rejects empty OCPP16 chargingSchedulePeriod arrays", () => {
    const validator = new Ocpp16Validator();
    const result = validator.validate(
      "SetChargingProfile",
      {
        ...ocpp16SetChargingProfileRequest,
        csChargingProfiles: {
          ...ocpp16SetChargingProfileRequest.csChargingProfiles,
          chargingSchedule: {
            ...ocpp16SetChargingProfileRequest.csChargingProfiles.chargingSchedule,
            chargingSchedulePeriod: [],
          },
        },
      },
      "request",
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.issues[0]).toMatchObject({
      path: [
        "csChargingProfiles",
        "chargingSchedule",
        "chargingSchedulePeriod",
      ],
      code: "too_small",
    });
  });

  test("rejects empty OCPP16 transactionData arrays when provided", () => {
    const validator = new Ocpp16Validator();
    const result = validator.validate(
      "StopTransaction",
      {
        meterStop: 100,
        timestamp: "2025-01-01T00:00:00Z",
        transactionId: 1,
        transactionData: [],
      },
      "request",
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.issues[0]).toMatchObject({
      path: ["transactionData"],
      code: "too_small",
    });
  });

  test("maps nested zod issues for invalid OCPP201 payloads", () => {
    const validator = new Ocpp201Validator();
    const result = validator.validate(
      "BootNotification",
      { reason: "PowerUp", chargingStation: { model: "FastCharger" } },
      "request",
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.issues[0]).toMatchObject({
      path: ["chargingStation", "vendorName"],
      code: "invalid_type",
    });
    expect(result.issues[0]?.message.length).toBeGreaterThan(0);
  });

  test("wraps registry failures in VALIDATE_ERROR", () => {
    const validator = new Ocpp16Validator(
      new Proxy({} as SchemaCatalog, {
        get() {
          throw new Error("registry exploded");
        },
      }),
    );

    expect(() =>
      validator.validate("BootNotification", ocpp16BootNotificationRequest, "request"),
    ).toThrow(
      expect.objectContaining({
        name: "ProtocolError",
        code: "VALIDATE_ERROR",
      }),
    );
  });

  test("wraps schema execution failures in VALIDATE_ERROR", () => {
    const throwingRegistry = {
      BootNotification: {
        request: {
          safeParse() {
            throw new Error("parse exploded");
          },
        },
        response: z.object({}),
      },
    } as unknown as SchemaCatalog;
    const validator = new Ocpp201Validator(throwingRegistry);

    expect(() =>
      validator.validate("BootNotification", ocpp201BootNotificationRequest, "request"),
    ).toThrow(
      expect.objectContaining({
        name: "ProtocolError",
        code: "VALIDATE_ERROR",
      }),
    );
  });
});
