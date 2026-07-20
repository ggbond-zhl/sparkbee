// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ChargingPointEventStreamMessage } from "../../src/features/charging-points/model/chargingPointRuntimeEvents";

const apiMocks = vi.hoisted(() => ({
  subscribeChargingPointEvents: vi.fn(() => vi.fn()),
}));

vi.mock("@/features/charging-points/api/chargingPoints", () => apiMocks);

import { useChargingPointRuntimeEvents } from "../../src/features/charging-points/model/useChargingPointRuntimeEvents";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useChargingPointRuntimeEvents", () => {
  test("notifies consumers after receiving the stream snapshot", () => {
    const onSnapshot = vi.fn();
    renderHook(() =>
      useChargingPointRuntimeEvents(
        "00000000-0000-4000-8000-000000000001",
        { onSnapshot },
      )
    );

    const handlers = apiMocks.subscribeChargingPointEvents.mock.calls[0]?.[1] as
      | { onEvent(message: ChargingPointEventStreamMessage): void }
      | undefined;

    act(() => {
      handlers?.onEvent({
        event: "snapshot",
        data: {
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          runtimeStatus: {
            chargingPointId: "00000000-0000-4000-8000-000000000001",
            status: "running",
          },
          sessionStatus: null,
          chargingPointStatus: null,
          chargingPointAvailability: null,
          evseStatuses: [],
          connectorStatuses: [],
          connectorAvailabilities: [],
          transactionStatuses: [],
          lastHeartbeatAt: null,
          recentIssue: null,
        },
      });
    });

    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });
});
