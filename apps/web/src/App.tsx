import {
  Cable,
  CircleStop,
  LogOut,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Send,
  SquarePen,
  Trash2,
  Unplug,
  Zap
} from "lucide-react";

import { useStationWorkbench } from "./useStationWorkbench";
import type { EventRecord } from "./types";

export function App() {
  const {
    authPanel,
    stationList,
    stationEditor,
    stationDetail,
    transactionPanel,
    eventTimeline,
    busy,
    notice,
  } = useStationWorkbench();
  const detail = stationDetail.detail;

  if (authPanel.authenticated === null) {
    return <main className="loading">连接控制台...</main>;
  }

  if (!authPanel.authenticated) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={authPanel.login}>
          <div>
            <p className="eyebrow">SPARKBEE</p>
            <h1>CSMS 调试台</h1>
            <p className="muted">输入管理员密码进入单用户自部署控制台。</p>
          </div>
          <label>
            <span>管理员密码</span>
            <input
              type="password"
              value={authPanel.password}
              onChange={(event) => authPanel.updatePassword(event.target.value)}
              autoFocus
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            <Play size={16} />
            登录
          </button>
          {notice && <p className="notice">{notice}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SPARKBEE</p>
          <h1>充电桩模拟控制台</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost" onClick={() => void stationList.refresh()} disabled={busy}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="ghost" onClick={() => void authPanel.logout()}>
            <LogOut size={16} />
            退出
          </button>
        </div>
      </header>

      {notice && <div className="notice-bar">{notice}</div>}

      <section className="workspace">
        <aside className="station-list">
          <div className="panel-title">
            <span>桩实例</span>
            <button
              className="icon"
              title="新建桩实例"
              onClick={stationEditor.createDraft}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="station-items">
            {stationList.stations.map((station) => (
              <button
                className={`station-row ${station.id === stationList.selectedId ? "active" : ""}`}
                key={station.id}
                onClick={() => stationList.selectStation(station.id)}
              >
                <span className={`status-dot ${station.runtimeStatus}`} />
                <span>
                  <strong>{station.name}</strong>
                  <small>{station.identity}</small>
                </span>
                <em>{station.runtimeStatus}</em>
              </button>
            ))}
            {stationList.stations.length === 0 && <p className="empty">还没有桩实例</p>}
          </div>

          <form className="station-form" onSubmit={stationEditor.save}>
            <div className="panel-title">
              <span>{stationEditor.editing ? "编辑桩" : "创建桩"}</span>
              {stationEditor.selectedStation && (
                <button className="icon" type="button" title="编辑当前桩" onClick={stationEditor.editSelected}>
                  <SquarePen size={16} />
                </button>
              )}
            </div>
            <Field label="名称" value={stationEditor.form.name} onChange={(value) => stationEditor.updateForm({ name: value })} />
            <Field label="CSMS URL" value={stationEditor.form.csmsBaseUrl} onChange={(value) => stationEditor.updateForm({ csmsBaseUrl: value })} />
            <Field label="桩身份" value={stationEditor.form.identity} onChange={(value) => stationEditor.updateForm({ identity: value })} />
            <Field label="厂商" value={stationEditor.form.vendor} onChange={(value) => stationEditor.updateForm({ vendor: value })} />
            <Field label="型号" value={stationEditor.form.model} onChange={(value) => stationEditor.updateForm({ model: value })} />
            <div className="form-grid">
              <Field
                label="枪口数"
                type="number"
                value={stationEditor.form.connectorCount}
                onChange={(value) => stationEditor.updateForm({ connectorCount: Number(value) })}
              />
              <Field
                label="功率 W"
                type="number"
                value={stationEditor.form.connectorMaxPowerW}
                onChange={(value) => stationEditor.updateForm({ connectorMaxPowerW: Number(value) })}
              />
            </div>
            <button className="primary" type="submit" disabled={busy}>
              <Save size={16} />
              {stationEditor.editing ? "保存修改" : "创建桩实例"}
            </button>
          </form>
        </aside>

        <section className="detail-panel">
          {detail === null ? (
            <div className="empty detail-empty">选择或创建一个桩实例</div>
          ) : (
            <>
              <div className="station-summary">
                <div>
                  <p className="eyebrow">{detail.station.protocol}</p>
                  <h2>{detail.station.name}</h2>
                  <p className="muted">{detail.station.csmsBaseUrl}/{detail.station.identity}</p>
                </div>
                <div className="summary-actions">
                  <button
                    className="primary"
                    disabled={busy || detail.station.runtimeStatus !== "stopped"}
                    onClick={() => void stationDetail.start()}
                  >
                    <Play size={16} />
                    启动
                  </button>
                  <button
                    className="danger"
                    disabled={busy || detail.station.runtimeStatus === "stopped"}
                    onClick={() => void stationDetail.stop()}
                  >
                    <CircleStop size={16} />
                    停止
                  </button>
                  <button
                    className="ghost"
                    disabled={busy}
                    onClick={() => void stationDetail.delete()}
                  >
                    <Trash2 size={16} />
                    删除
                  </button>
                </div>
              </div>

              <div className="metrics-strip">
                <Metric label="运行意图" value={detail.station.desiredStatus} />
                <Metric label="运行状态" value={detail.station.runtimeStatus} />
                <Metric label="枪口数" value={detail.station.connectorCount} />
                <Metric label="单枪功率" value={`${detail.station.connectorMaxPowerW} W`} />
              </div>

              <div className="connector-grid">
                {Array.from({ length: detail.station.connectorCount }, (_, index) => {
                  const id = index + 1;
                  const snapshot = detail.connectors.find((connector) => connector.connectorId === id);
                  return (
                    <div className="connector-cell" key={id}>
                      <div>
                        <p className="eyebrow">CONNECTOR {id}</p>
                        <strong>{snapshot?.status ?? "available"}</strong>
                        <small>{snapshot?.plugState ?? "unplugged"} / {snapshot?.vehiclePresence ?? "absent"}</small>
                      </div>
                      <div className="cell-actions">
                        <button className="ghost" disabled={busy} onClick={() => void stationDetail.plug(id)}>
                          <Plug size={15} />
                          插枪
                        </button>
                        <button className="ghost" disabled={busy} onClick={() => void stationDetail.unplug(id)}>
                          <Unplug size={15} />
                          拔枪
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="operation-panel">
                <div className="panel-title">
                  <span>交易操作</span>
                  <Cable size={16} />
                </div>
                <div className="operation-grid">
                  <Field label="枪口" type="number" value={transactionPanel.connectorId} onChange={(value) => transactionPanel.updateConnectorId(Number(value))} />
                  <Field label="idTag" value={transactionPanel.idTag} onChange={transactionPanel.updateIdTag} />
                  <Field label="表值 Wh" type="number" value={transactionPanel.meterWh} onChange={(value) => transactionPanel.updateMeterWh(Number(value))} />
                  <Field label="交易 ID" value={transactionPanel.activeTransactionId} onChange={transactionPanel.updateTransactionId} />
                </div>
                <div className="operation-actions">
                  <button className="ghost" disabled={busy} onClick={() => void transactionPanel.authorize()}>
                    <Zap size={16} />
                    授权
                  </button>
                  <button className="primary" disabled={busy} onClick={() => void transactionPanel.startTransaction()}>
                    <Play size={16} />
                    开始交易
                  </button>
                  <button className="ghost" disabled={busy || transactionPanel.activeTransactionId.length === 0} onClick={() => void transactionPanel.reportMeterValue()}>
                    <Send size={16} />
                    上报表值
                  </button>
                  <button className="danger" disabled={busy || transactionPanel.activeTransactionId.length === 0} onClick={() => void transactionPanel.stopTransaction()}>
                    <CircleStop size={16} />
                    结束交易
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="event-panel">
          <div className="timeline">
            <div className="panel-title">
              <span>事件流</span>
              <span>{eventTimeline.events.length}</span>
            </div>
            <EventList events={eventTimeline.events} />
          </div>
          <div className="protocol-log">
            <div className="panel-title">
              <span>协议报文</span>
              <span>{eventTimeline.protocolEvents.length}</span>
            </div>
            <EventList events={eventTimeline.protocolEvents} compact />
          </div>
        </aside>
      </section>
    </main>
  );
}

function Field(props: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: number | string;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function Metric(props: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function EventList(props: { compact?: boolean; events: EventRecord[] }) {
  if (props.events.length === 0) {
    return <p className="empty">暂无记录</p>;
  }

  return (
    <div className={props.compact ? "events compact" : "events"}>
      {props.events.map((event) => (
        <article className="event-row" key={event.id}>
          <div>
            <strong>{event.type}</strong>
            <time>{new Date(event.occurredAt).toLocaleTimeString()}</time>
          </div>
          <pre>{JSON.stringify(event.payload, null, props.compact ? 0 : 2)}</pre>
        </article>
      ))}
    </div>
  );
}
