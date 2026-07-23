// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const chargingPointId = "00000000-0000-4000-8000-000000000001";
const baseItem = {
  key: "HeartbeatInterval",
  value: "60",
  defaultValue: "60",
  readonly: false,
  valueType: "integer",
  rebootRequired: false,
  minValue: 1,
  maxValue: null,
  description: "桩向中心系统发送心跳的间隔。",
  version: 1,
  pendingRestart: false,
  lastModifiedBy: "initialization",
  updatedAt: "2026-07-22T08:00:00.000Z",
} as const;

class EventSourceDouble {
  static current: EventSourceDouble | null = null;
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    EventSourceDouble.current = this;
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener as (event: MessageEvent<string>) => void);
  }

  removeEventListener(type: string) {
    this.listeners.delete(type);
  }

  close() {}

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

beforeEach(() => {
  window.history.replaceState(
    {},
    "",
    `/charging-points/${chargingPointId}/configuration`,
  );
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  vi.stubGlobal("EventSource", EventSourceDouble);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(
    (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify({
          status: "accepted",
          item: {
            ...baseItem,
            value: "30",
            version: 2,
            lastModifiedBy: "ui",
          },
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        chargingPointId,
        protocol: "OCPP16J",
        items: [
          baseItem,
          {
            ...baseItem,
            key: "NumberOfConnectors",
            value: "1",
            defaultValue: "1",
            readonly: true,
            description: "枪口数量。",
          },
        ],
      }), { status: 200 }));
    },
  ));
});

afterEach(async () => {
  cleanup();
  const { queryClient } = await import("@/app/queryClient");
  queryClient.clear();
  EventSourceDouble.current = null;
  vi.unstubAllGlobals();
});

test("用户查看、筛选并单项编辑协议配置，SSE 会刷新当前值", async () => {
  const [{ App }, { router }] = await Promise.all([
    import("@/App"),
    import("@/app/router"),
  ]);
  await router.load();
  render(<App />);

  expect(await screen.findByRole("table")).toBeTruthy();
  expect(screen.getByText("协议配置")).toBeTruthy();
  expect(screen.getByRole("link", { name: "返回运行调试台" }).getAttribute("href"))
    .toBe(`/charging-points/${chargingPointId}`);
  expect(screen.getAllByText("HeartbeatInterval").length).toBeGreaterThan(0);
  expect(screen.getAllByText("NumberOfConnectors").length).toBeGreaterThan(0);
  expect(screen.getByPlaceholderText("搜索配置键或说明")).toBeTruthy();

  fireEvent.click(
    screen.getAllByRole("button", { name: "编辑 HeartbeatInterval" })[0]!,
  );
  expect(await screen.findByRole("dialog", { name: "编辑 HeartbeatInterval" })).toBeTruthy();
  const valueInput = screen.getByRole("spinbutton", { name: "配置值" });
  fireEvent.change(valueInput, { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "编辑 HeartbeatInterval" }))
      .toBeNull();
  });
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(
    `/api/charging-points/${chargingPointId}/configuration/HeartbeatInterval`,
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ value: "30", expectedVersion: 1 }),
    }),
  );

  expect(EventSourceDouble.current?.listeners.has("configuration.changed")).toBe(true);
  await act(async () => {
    EventSourceDouble.current?.emit("configuration.changed", {
      id: "event-1",
      sequence: 1,
      type: "configuration.changed",
      chargingPointId,
      protocol: "OCPP16J",
      resource: { scope: "configuration", key: "HeartbeatInterval" },
      occurredAt: "2026-07-22T09:00:00.000Z",
      value: "45",
      version: 3,
      lastModifiedBy: "csms",
      pendingRestart: false,
    });
  });
  await waitFor(() => {
    expect(screen.getAllByText("45").length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getByRole("radio", { name: "只读" }));
  expect(screen.queryByText("HeartbeatInterval")).toBeNull();
  expect(screen.getAllByText("NumberOfConnectors").length).toBeGreaterThan(0);
}, 12_000);
