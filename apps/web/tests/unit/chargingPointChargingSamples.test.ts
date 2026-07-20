import { describe, expect, test } from "vitest";

import {
  buildActiveChargingSampleSeriesByConnector,
  buildChargingSampleSeriesByConnector,
  chargingSampleConnectorKey,
} from "../../src/features/charging-points/model/chargingPointChargingSamples";
import type { RuntimeEventLogEntry } from "../../src/features/charging-points/model/chargingPointRuntimeEvents";

describe("charging point charging samples", () => {
  test("groups transaction meter samples by connector in sampled order", () => {
    const events: RuntimeEventLogEntry[] = [
      {
        id: "sample-2",
        occurredAt: "2026-07-04T09:00:10.000Z",
        eventType: "transaction.meterValue",
        resource: "交易 tx-1",
        summary: "交易 tx-1: 130.000 Wh",
        detail: {
          type: "transaction.meterValue",
          chargingPointId: "cp-1",
          resource: {
            scope: "transaction",
            evseId: 1,
            connectorId: 1,
            transactionId: "tx-1",
          },
          occurredAt: "2026-07-04T09:00:10.000Z",
          meterWh: 130,
          powerW: 7200,
          currentA: 32,
          voltageV: 225,
          sampledAt: "2026-07-04T09:00:10.000Z",
        },
      },
      {
        id: "ignored-old-shape",
        occurredAt: "2026-07-04T09:00:05.000Z",
        eventType: "transaction.meterValue",
        resource: "交易 tx-1",
        summary: "交易 tx-1: 120.000 Wh",
        detail: {
          type: "transaction.meterValue",
          chargingPointId: "cp-1",
          resource: {
            scope: "transaction",
            evseId: 1,
            connectorId: 1,
            transactionId: "tx-1",
          },
          occurredAt: "2026-07-04T09:00:05.000Z",
          meterWh: 120,
          sampledAt: "2026-07-04T09:00:05.000Z",
        },
      },
      {
        id: "sample-1",
        occurredAt: "2026-07-04T09:00:00.000Z",
        eventType: "transaction.meterValue",
        resource: "交易 tx-1",
        summary: "交易 tx-1: 100.000 Wh",
        detail: {
          type: "transaction.meterValue",
          chargingPointId: "cp-1",
          resource: {
            scope: "transaction",
            evseId: 1,
            connectorId: 1,
            transactionId: "tx-1",
          },
          occurredAt: "2026-07-04T09:00:00.000Z",
          meterWh: 100,
          powerW: 7000,
          currentA: 31,
          voltageV: 226,
          sampledAt: "2026-07-04T09:00:00.000Z",
        },
      },
      {
        id: "other-connector",
        occurredAt: "2026-07-04T09:00:00.000Z",
        eventType: "transaction.meterValue",
        resource: "交易 tx-2",
        summary: "交易 tx-2: 50.000 Wh",
        detail: {
          type: "transaction.meterValue",
          chargingPointId: "cp-1",
          resource: {
            scope: "transaction",
            evseId: 1,
            connectorId: 2,
            transactionId: "tx-2",
          },
          occurredAt: "2026-07-04T09:00:00.000Z",
          meterWh: 50,
          powerW: 3600,
          currentA: 16,
          voltageV: 225,
          sampledAt: "2026-07-04T09:00:00.000Z",
        },
      },
      {
        id: "status",
        occurredAt: "2026-07-04T09:00:00.000Z",
        eventType: "transaction.status",
        resource: "交易 tx-1",
        summary: "交易 tx-1: 进行中",
        detail: {},
      },
    ];

    const samplesByConnector = buildChargingSampleSeriesByConnector(events);

    expect(samplesByConnector.get(chargingSampleConnectorKey(1, 1))).toMatchObject([
      { id: "sample-1", meterWh: 100, powerW: 7000 },
      { id: "sample-2", meterWh: 130, powerW: 7200 },
    ]);
    expect(samplesByConnector.get(chargingSampleConnectorKey(1, 2))).toMatchObject([
      { id: "other-connector", meterWh: 50, currentA: 16 },
    ]);
  });

  test("restores only the persisted active transaction after page recreation", () => {
    const persisted = {
      items: [
        {
          transactionId: "tx-1",
          evseId: 1,
          connectorId: 1,
          samples: [
            {
              id: "sample-1",
              sampledAt: "2026-07-04T09:00:00.000Z",
              meterWh: 100,
              powerW: 7000,
              currentA: 31,
              voltageV: 226,
            },
          ],
        },
      ],
    };

    const restored = buildActiveChargingSampleSeriesByConnector({
      persisted,
      events: [],
      transactionStatuses: {},
    });
    expect(restored.get(chargingSampleConnectorKey(1, 1))).toMatchObject([
      { id: "sample-1", transactionId: "tx-1", meterWh: 100 },
    ]);

    const ended = buildActiveChargingSampleSeriesByConnector({
      persisted,
      events: [],
      transactionStatuses: {
        "tx-1": {
          transactionId: "tx-1",
          evseId: 1,
          connectorId: 1,
          currentStatus: "ended",
          occurredAt: "2026-07-04T09:01:00.000Z",
        },
      },
    });
    expect(ended.has(chargingSampleConnectorKey(1, 1))).toBe(false);
  });
});
