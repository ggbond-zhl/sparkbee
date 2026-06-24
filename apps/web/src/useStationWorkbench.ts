import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { api } from "./api";
import type { EventRecord, Station, StationDetail, StationFormInput } from "./types";

const emptyForm: StationFormInput = {
  name: "测试桩 01",
  csmsBaseUrl: "ws://localhost:9000/ocpp",
  identity: "CP-001",
  vendor: "SparkBee",
  model: "BeeBox",
  connectorCount: 2,
  connectorMaxPowerW: 7000
};

export function useStationWorkbench() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StationDetail | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [form, setForm] = useState<StationFormInput>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [idTag, setIdTag] = useState("A00001");
  const [connectorId, setConnectorId] = useState(1);
  const [meterWh, setMeterWh] = useState(1000);
  const [activeTransactionId, setActiveTransactionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === selectedId) ?? null,
    [selectedId, stations],
  );
  const protocolEvents = events.filter((event) => event.protocolMessage);

  useEffect(() => {
    void api.session()
      .then(() => {
        setAuthenticated(true);
        return reloadStations();
      })
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const source = new EventSource("/api/events/stream", { withCredentials: true });
    source.addEventListener("event", (message) => {
      const event = JSON.parse((message as MessageEvent).data) as EventRecord;
      setEvents((current) => [event, ...current].slice(0, 300));
      if (event.stationId !== null && event.stationId === selectedId) {
        void reloadDetail(event.stationId);
      }
    });
    source.onerror = () => {
      setNotice("实时事件流断开，浏览器会自动重连");
    };

    return () => source.close();
  }, [authenticated, selectedId]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      setEvents([]);
      return;
    }

    void reloadDetail(selectedId);
    void api.listEvents(selectedId).then((items) => setEvents(items.reverse()));
  }, [selectedId]);

  async function reloadStations() {
    const items = await api.listStations();
    setStations(items);
    setSelectedId((current) => current ?? items[0]?.id ?? null);
  }

  async function reloadDetail(id: string) {
    const nextDetail = await api.getStation(id);
    setDetail(nextDetail);
    setStations((current) =>
      current.map((station) => station.id === id ? nextDetail.station : station)
    );
  }

  async function run(
    action: () => Promise<unknown>,
    success: string,
    options: { reloadDetail: boolean } = { reloadDetail: true },
  ) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await reloadStations();
      if (options.reloadDetail && selectedId !== null) {
        await reloadDetail(selectedId);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api.login(loginPassword);
      setAuthenticated(true);
      await reloadStations();
    }, "已登录");
  }

  async function logout() {
    setBusy(true);
    setNotice(null);
    try {
      await api.logout();
      setAuthenticated(false);
      setNotice("已退出");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveStation(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (editing && selectedId !== null) {
        await api.updateStation(selectedId, form);
        setEditing(false);
        return;
      }
      const station = await api.createStation(form);
      setSelectedId(station.id);
    }, editing ? "桩实例已更新" : "桩实例已创建");
  }

  function editSelected() {
    if (selectedStation === null) {
      return;
    }

    setForm({
      name: selectedStation.name,
      csmsBaseUrl: selectedStation.csmsBaseUrl,
      identity: selectedStation.identity,
      vendor: selectedStation.vendor,
      model: selectedStation.model,
      connectorCount: selectedStation.connectorCount,
      connectorMaxPowerW: selectedStation.connectorMaxPowerW
    });
    setEditing(true);
  }

  function createDraftStation() {
    setEditing(false);
    setForm(emptyForm);
  }

  function updateForm(patch: Partial<StationFormInput>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function requireDetail(): StationDetail {
    if (detail === null) {
      throw new Error("请选择桩实例");
    }

    return detail;
  }

  function refresh() {
    return reloadStations();
  }

  function startStation() {
    const current = requireDetail();
    return run(() => api.startStation(current.station.id), "启动命令已发送");
  }

  function stopStation() {
    const current = requireDetail();
    return run(() => api.stopStation(current.station.id), "停止命令已发送");
  }

  function deleteStation() {
    const current = requireDetail();
    return run(async () => {
      await api.deleteStation(current.station.id);
      setSelectedId(null);
      setDetail(null);
    }, "桩实例已删除", { reloadDetail: false });
  }

  function plug(connector: number) {
    const current = requireDetail();
    return run(() => api.plug(current.station.id, connector), `枪口 ${connector} 已插枪`);
  }

  function unplug(connector: number) {
    const current = requireDetail();
    return run(() => api.unplug(current.station.id, connector), `枪口 ${connector} 已拔枪`);
  }

  function authorize() {
    const current = requireDetail();
    return run(
      () => api.authorize(current.station.id, connectorId, idTag),
      "授权请求已发送",
    );
  }

  function startTransaction() {
    const current = requireDetail();
    return run(async () => {
      const result = await api.startTransaction(current.station.id, connectorId, idTag, meterWh);
      if (result.transactionId) {
        setActiveTransactionId(result.transactionId);
      }
    }, "开始交易请求已发送");
  }

  function reportMeterValue() {
    const current = requireDetail();
    return run(
      () => api.reportMeterValue(current.station.id, activeTransactionId, meterWh),
      "表值已上报",
    );
  }

  function stopTransaction() {
    const current = requireDetail();
    return run(
      () => api.stopTransaction(current.station.id, activeTransactionId, meterWh),
      "结束交易请求已发送",
    );
  }

  return {
    authPanel: {
      authenticated,
      password: loginPassword,
      updatePassword: setLoginPassword,
      login: handleLogin,
      logout,
    },
    stationList: {
      stations,
      selectedId,
      selectStation: setSelectedId,
      refresh,
    },
    stationEditor: {
      form,
      updateForm,
      editing,
      selectedStation,
      save: handleSaveStation,
      editSelected,
      createDraft: createDraftStation,
    },
    stationDetail: {
      detail,
      start: startStation,
      stop: stopStation,
      delete: deleteStation,
      plug,
      unplug,
    },
    transactionPanel: {
      idTag,
      updateIdTag: setIdTag,
      connectorId,
      updateConnectorId: setConnectorId,
      meterWh,
      updateMeterWh: setMeterWh,
      activeTransactionId,
      updateTransactionId: setActiveTransactionId,
      authorize,
      startTransaction,
      reportMeterValue,
      stopTransaction,
    },
    eventTimeline: {
      events,
      protocolEvents,
    },
    busy,
    notice,
  };
}
