// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ProtocolConfigurationItem } from "@spark-bee/contracts";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ChargingPointEventStreamMessage } from "../../src/features/charging-points/model/chargingPointRuntimeEvents";

const chargingPointId = "00000000-0000-4000-8000-000000000001";
const apiMocks = vi.hoisted(() => ({
  listProtocolConfiguration: vi.fn(),
  subscribeChargingPointEvents: vi.fn(() => vi.fn()),
  updateProtocolConfiguration: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/features/charging-points/api/chargingPoints", async (importOriginal) => ({
  ...await importOriginal<typeof import(
    "../../src/features/charging-points/api/chargingPoints"
  )>(),
  ...apiMocks,
}));

import { ProtocolConfigurationApiError } from "../../src/features/charging-points/api/chargingPoints";
import { useProtocolConfigurationWorkbench } from "../../src/features/charging-points/model/useProtocolConfigurationWorkbench";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useProtocolConfigurationWorkbench", () => {
  test("refreshes the latest item after a CAS conflict", async () => {
    apiMocks.listProtocolConfiguration
      .mockResolvedValueOnce(configurationDirectory(configurationItem()))
      .mockResolvedValueOnce(configurationDirectory(configurationItem({
        value: "45",
        version: 2,
        lastModifiedBy: "csms",
      })));
    apiMocks.updateProtocolConfiguration.mockRejectedValueOnce(
      new ProtocolConfigurationApiError("配置已被其他操作更新", 409),
    );
    const { queryClient, result } = renderWorkbench();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      result.current.editor.open(result.current.items[0]!);
    });
    act(() => {
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      result.current.editor.setDraftValue("30");
    });
    act(() => {
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      result.current.editor.save();
    });

    await waitFor(() => {
      expect(apiMocks.updateProtocolConfiguration).toHaveBeenCalledWith(
        chargingPointId,
        "HeartbeatInterval",
        { value: "30", expectedVersion: 1 },
      );
      expect(apiMocks.listProtocolConfiguration).toHaveBeenCalledTimes(2);
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      expect(result.current.items[0]).toMatchObject({ value: "45", version: 2 });
      expect(result.current.editor.item).toBeNull();
    });
    queryClient.clear();
  });

  test("keeps the active draft when SSE updates the cached item", async () => {
    apiMocks.listProtocolConfiguration.mockResolvedValueOnce(
      configurationDirectory(configurationItem()),
    );
    const { queryClient, result } = renderWorkbench();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      result.current.editor.open(result.current.items[0]!);
    });
    act(() => {
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      result.current.editor.setDraftValue("30");
    });
    const handlers = apiMocks.subscribeChargingPointEvents.mock.calls[0]?.[1] as
      | { onEvent(message: ChargingPointEventStreamMessage): void }
      | undefined;

    act(() => {
      handlers?.onEvent({
        event: "configuration.changed",
        data: {
          id: "00000000-0000-4000-8000-000000000010",
          sequence: 10,
          type: "configuration.changed",
          chargingPointId,
          protocol: "OCPP16J",
          resource: { scope: "configuration", key: "HeartbeatInterval" },
          occurredAt: "2026-07-27T04:05:00.000Z",
          value: "45",
          version: 2,
          lastModifiedBy: "csms",
          pendingRestart: false,
        },
      });
    });

    await waitFor(() => {
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      expect(result.current.items[0]).toMatchObject({ value: "45", version: 2 });
      expect(result.current.editor.item).toMatchObject({ value: "60", version: 1 });
      expect(result.current.editor.draftValue).toBe("30");
    });
    queryClient.clear();
  });

  test("restores the default through the versioned update seam", async () => {
    const currentItem = configurationItem({
      value: "30",
      version: 2,
      lastModifiedBy: "ui",
    });
    const restoredItem = configurationItem({
      value: "60",
      version: 3,
      lastModifiedBy: "ui",
    });
    apiMocks.listProtocolConfiguration.mockResolvedValueOnce(
      configurationDirectory(currentItem),
    );
    apiMocks.updateProtocolConfiguration.mockResolvedValueOnce({
      status: "accepted",
      item: restoredItem,
    });
    const { queryClient, result } = renderWorkbench();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      result.current.editor.open(result.current.items[0]!);
    });
    act(() => {
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      result.current.editor.restoreDefault();
    });

    await waitFor(() => {
      expect(apiMocks.updateProtocolConfiguration).toHaveBeenCalledWith(
        chargingPointId,
        "HeartbeatInterval",
        { value: "60", expectedVersion: 2 },
      );
      if (result.current.status !== "ready") throw new Error("workbench 未就绪");
      expect(result.current.items[0]).toMatchObject({ value: "60", version: 3 });
      expect(result.current.editor.item).toBeNull();
    });
    queryClient.clear();
  });
});

function renderWorkbench() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    () => useProtocolConfigurationWorkbench(chargingPointId),
    { wrapper },
  );
  return { queryClient, ...rendered };
}

function configurationDirectory(item: ProtocolConfigurationItem) {
  return {
    chargingPointId,
    protocol: "OCPP16J" as const,
    items: [item],
  };
}

function configurationItem(
  overrides: Partial<ProtocolConfigurationItem> = {},
): ProtocolConfigurationItem {
  return {
    key: "HeartbeatInterval",
    value: "60",
    defaultValue: "60",
    readonly: false,
    valueType: "integer",
    rebootRequired: false,
    minValue: 1,
    maxValue: null,
    description: "桩向 CSMS 发送心跳的间隔。",
    version: 1,
    pendingRestart: false,
    lastModifiedBy: "initialization",
    updatedAt: "2026-07-27T04:00:00.000Z",
    ...overrides,
  };
}
