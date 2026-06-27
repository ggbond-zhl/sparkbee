import { describe, expect, test } from "vitest";

import {
  chargingPointOperationResponseSchema,
  createChargingPointRequestSchema,
  createConnectorRequestSchema,
  listChargingPointsQuerySchema,
} from "../../src";

describe("chargingPoint contract schemas", () => {
  test("normalizes chargingPoint create input", () => {
    expect(
      createChargingPointRequestSchema.parse({
        identity: " CP001 ",
        protocol: "OCPP16J",
        centralSystemUrl: " ws://localhost:9000/ocpp ",
        vendor: " SparkBee ",
        model: " DebugBox ",
        firmwareVersion: "  ",
        serialNumber: " SN-001 ",
      }),
    ).toEqual({
      identity: "CP001",
      protocol: "OCPP16J",
      centralSystemUrl: "ws://localhost:9000/ocpp",
      vendor: "SparkBee",
      model: "DebugBox",
      firmwareVersion: null,
      serialNumber: "SN-001",
    });
  });

  test("rejects invalid chargingPoint identity", () => {
    expect(() =>
      createChargingPointRequestSchema.parse({
        identity: "CP 001",
        protocol: "OCPP16J",
        centralSystemUrl: "ws://localhost:9000/ocpp",
        vendor: "SparkBee",
        model: "DebugBox",
      }),
    ).toThrow();
  });

  test("normalizes list query defaults and coercion", () => {
    expect(listChargingPointsQuerySchema.parse({ keyword: " CP " })).toEqual({
      page: 1,
      pageSize: 20,
      keyword: "CP",
    });

    expect(listChargingPointsQuerySchema.parse({ page: "2", pageSize: "10" })).toEqual({
      page: 2,
      pageSize: 10,
    });
  });

  test("accepts nullable connector rated values", () => {
    expect(
      createConnectorRequestSchema.parse({
        evseId: 1,
        connectorId: 1,
        type: " Type2 ",
        format: "socket",
        powerType: "ac",
        maxVoltage: null,
      }),
    ).toMatchObject({
      evseId: 1,
      connectorId: 1,
      type: "Type2",
      format: "socket",
      powerType: "ac",
      maxVoltage: null,
    });
  });

  test("describes chargingPoint operation response in Chinese", () => {
    expect(
      chargingPointOperationResponseSchema.parse({
        chargingPointId: "00000000-0000-4000-8000-000000000001",
        status: "starting",
        bootStatus: "Pending",
        retryAfterSec: 30,
      }),
    ).toEqual({
      chargingPointId: "00000000-0000-4000-8000-000000000001",
      status: "starting",
      bootStatus: "Pending",
      retryAfterSec: 30,
    });
    expect(chargingPointOperationResponseSchema.shape.status.description).toBe(
      "当前服务进程中的运行状态。",
    );
  });
});
