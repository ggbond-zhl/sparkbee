// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ChargingPointEventStreamMessage } from "../../src/features/charging-points/model/chargingPointRuntimeEvents";

const apiMocks = vi.hoisted(() => ({
  listProtocolEvents: vi.fn(async () => ({ items: [], previousCursor: null })),
  listProtocolMessages: vi.fn(async () => ({ items: [], previousCursor: null })),
  listTransactionDeliveries: vi.fn(async () => ({ items: [], previousCursor: null })),
  subscribeChargingPointEvents: vi.fn(() => vi.fn()),
}));

vi.mock("@/features/charging-points/api/chargingPoints", async (importOriginal) => ({
  ...await importOriginal<typeof import(
    "../../src/features/charging-points/api/chargingPoints"
  )>(),
  ...apiMocks,
}));

import { useChargingPointObservation } from "../../src/features/charging-points/model/useChargingPointObservation";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useChargingPointObservation", () => {
  test("uses one event stream for runtime state and transaction deliveries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const onRuntimeStatus = vi.fn();
    const onSnapshot = vi.fn();
    const { result } = renderHook(
      () => useChargingPointObservation(
        "00000000-0000-4000-8000-000000000001",
        { enabled: true, onRuntimeStatus, onSnapshot },
      ),
      { wrapper },
    );

    await waitFor(() => {
      expect(apiMocks.subscribeChargingPointEvents).toHaveBeenCalledTimes(1);
    });
    const handlers = apiMocks.subscribeChargingPointEvents.mock.calls[0]?.[1] as
      | { onEvent(message: ChargingPointEventStreamMessage): void }
      | undefined;

    act(() => {
      handlers?.onEvent({
        event: "transaction-delivery.changed",
        data: {
          id: "00000000-0000-4000-8000-000000000010",
          sequence: 10,
          chargingPointId: "00000000-0000-4000-8000-000000000001",
          protocol: "OCPP16J",
          occurredAt: "2026-07-27T04:00:00.000Z",
          type: "transaction-delivery.changed",
          resource: {
            scope: "transactionDelivery",
            transactionId: "transaction-1",
            messageId: "00000000-0000-4000-8000-000000000011",
            deliverySequence: "1",
          },
          messageType: "start",
          previousStatus: null,
          currentStatus: "pending",
          attemptCount: 0,
          nextAttemptAt: null,
          lastError: null,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.observation.transactionDeliveries.items)
        .toEqual([expect.objectContaining({
          messageId: "00000000-0000-4000-8000-000000000011",
          status: "pending",
        })]);
    });
    expect(apiMocks.subscribeChargingPointEvents).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });
});
