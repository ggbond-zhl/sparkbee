import { useParams } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PencilIcon,
  PinIcon,
  PlayIcon,
  PlugZapIcon,
  SquareIcon,
  UnplugIcon,
} from "lucide-react";
import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type ConnectorCardAction,
  type ConnectorCardModel,
} from "@/features/charging-points/model/chargingPointConnectorCards";
import {
  type ChargingSamplePoint,
} from "@/features/charging-points/model/chargingPointChargingSamples";
import {
  type ChargingPointDetailHeaderModel,
  type HeaderMetricItem,
} from "@/features/charging-points/model/chargingPointDetailHeader";
import type {
  ProtocolMessageLogEntry,
  RuntimeEventLogEntry,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";
import {
  ALL_RUNTIME_LOG_TYPE_FILTER,
  RUNTIME_LOG_TIME_FILTER_OPTIONS,
  buildRuntimeLogTypeFilterOptions,
  filterRuntimeLogEntries,
  getRuntimeLogEmptyText,
  type RuntimeLogTimeFilter,
  type RuntimeLogTypeFilterOption,
} from "@/features/charging-points/model/chargingPointRuntimeLogFilters";
import { useChargingPointWorkbench } from "@/features/charging-points/model/useChargingPointWorkbench";
import { ChargingPointConnectorEditDialog } from "@/features/charging-points/ui/ChargingPointConnectorEditDialog";
import { ChargingPointEditDialog } from "@/features/charging-points/ui/ChargingPointEditDialog";
import { cn } from "@/lib/utils";

export function ChargingPointDetailPage() {
  const { chargingPointId } = useParams({
    from: "/charging-points/$chargingPointId",
  });
  const workbench = useChargingPointWorkbench(chargingPointId);

  if (workbench.status === "loading") {
    return <DetailState text="桩实例详情加载中" />;
  }

  if (workbench.status === "error") {
    return <DetailState className="text-destructive" text="桩实例详情加载失败" />;
  }

  const {
    chargingPointEditor,
    configuration,
    connectorEditor,
    connectorItems,
    connectors,
    detail,
    headerModel,
    observation,
    runtime,
  } = workbench;

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{detail.name}</CardTitle>
              <StatusBadge item={headerModel.mainStatus} />
              <span className="text-xs text-muted-foreground">
                {headerModel.lastHeartbeatLabel}
              </span>
            </div>
          </div>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={chargingPointEditor.openEditor}
            >
              <PencilIcon data-icon="inline-start" />
              编辑
            </Button>
            <Button
              disabled={headerModel.primaryAction.disabled || runtime.pending}
              type="button"
              variant={headerModel.primaryAction.kind === "stop" ? "destructive" : "default"}
              onClick={runtime.applyPrimaryAction}
            >
              {runtime.pending ? "处理中" : headerModel.primaryAction.label}
            </Button>
          </CardAction>
          {headerModel.finalConnectionUrl && (
            <div className="col-span-full min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{headerModel.finalConnectionUrl}</span>
                  </p>
                </TooltipTrigger>
                <TooltipContent className="break-all">
                  {headerModel.finalConnectionUrl}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2 md:grid-cols-2">
            <StatusMetric label="枪口" value={headerModel.connectorSummary} />
            <StatusMetric label="交易" value={headerModel.transactionSummary} />
          </div>

          <RuntimeSummaryPanel items={headerModel.runtimeSummaryItems} />

          {headerModel.primaryAction.disabledReason && (
            <p className="text-sm text-muted-foreground">
              {headerModel.primaryAction.disabledReason}
            </p>
          )}
        </CardContent>
      </Card>
      <section className="grid gap-3">
        {connectorItems.map(({ model, samples }) => (
          <ConnectorRuntimeCard
            key={model.connectorId}
            configurationLocked={configuration.locked}
            configurationLockedReason={configuration.connectorEditLockedReason}
            disabled={connectors.pending}
            model={model}
            samples={samples}
            onEdit={() => connectorEditor.open(model.connector)}
            onPlug={() => connectors.plug(model.connectorId)}
            onStartCharging={(idTag) =>
              connectors.startTransaction(model.connectorId, idTag)}
            onStopCharging={(transactionId) =>
              connectors.stopTransaction(model.connectorId, transactionId)}
            onUnplug={() => connectors.unplug(model.connectorId)}
          />
        ))}
      </section>
      <RuntimeObservationTabs
        events={observation.events}
        protocolMessages={observation.protocolMessages}
      />
      <ChargingPointEditDialog
        configurationLocked={configuration.locked}
        configurationLockedReason={configuration.lockedReason}
        item={detail}
        open={chargingPointEditor.open}
        onOpenChange={chargingPointEditor.setOpen}
        onSaved={chargingPointEditor.save}
      />
      {connectorEditor.target && (
        <ChargingPointConnectorEditDialog
          chargingPointId={chargingPointId}
          configurationLocked={configuration.locked}
          configurationLockedReason={configuration.connectorEditLockedReason}
          connector={connectorEditor.target}
          open={connectorEditor.target !== null}
          onOpenChange={connectorEditor.setOpen}
          onSaved={connectorEditor.save}
        />
      )}
    </section>
  );
}

function DetailMetric({
  label,
  monospace,
  tone,
  value,
}: HeaderMetricItem) {
  return (
    <dl
      className={cn(
        "min-w-0 rounded-lg border border-border/40 px-3 py-2",
        tone === "success" && "border-emerald-500/20 bg-emerald-500/10",
        tone === "waiting" && "border-sky-500/20 bg-sky-500/10",
        tone === "warning" && "border-amber-500/25 bg-amber-500/10",
        tone === "destructive" && "border-destructive/25 bg-destructive/10",
      )}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <Tooltip>
        <TooltipTrigger asChild>
          <dd
            className={cn(
              "mt-1 truncate text-sm",
              monospace && "font-mono text-xs",
            )}
          >
            {value}
          </dd>
        </TooltipTrigger>
        <TooltipContent className="break-all">{value}</TooltipContent>
      </Tooltip>
    </dl>
  );
}

function RuntimeSummaryPanel({ items }: { items: HeaderMetricItem[] }) {
  return (
    <section>
      <div className="grid gap-2 md:grid-cols-4">
        {items.map((item) => (
          <DetailMetric key={item.label} {...item} />
        ))}
      </div>
    </section>
  );
}

function StatusMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "neutral" | "success" | "waiting" | "warning" | "destructive";
  value: string;
}) {
  return (
    <dl
      className={cn(
        "min-w-0 rounded-lg border border-transparent bg-muted/40 px-3 py-2",
        tone === "success" && "border-emerald-500/20 bg-emerald-500/10",
        tone === "waiting" && "border-sky-500/20 bg-sky-500/10",
        tone === "warning" && "border-amber-500/25 bg-amber-500/10",
        tone === "destructive" && "border-destructive/25 bg-destructive/10",
      )}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
    </dl>
  );
}

function ConnectorRuntimeCard({
  configurationLocked,
  configurationLockedReason,
  disabled,
  model,
  samples,
  onEdit,
  onPlug,
  onStartCharging,
  onStopCharging,
  onUnplug,
}: {
  configurationLocked: boolean;
  configurationLockedReason?: string;
  disabled: boolean;
  model: ConnectorCardModel;
  samples: ChargingSamplePoint[];
  onEdit(): void;
  onPlug(): void;
  onStartCharging(idTag: string): void;
  onStopCharging(transactionId: string): void;
  onUnplug(): void;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-x-3 gap-y-1">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{model.title}</CardTitle>
          <CardDescription className="mt-1 truncate">
            {model.description}
          </CardDescription>
        </div>
        <CardAction className="flex flex-wrap justify-end gap-2">
          <ConnectorEditButton
            configurationLocked={configurationLocked}
            configurationLockedReason={configurationLockedReason}
            label={`编辑${model.title}`}
            onEdit={onEdit}
          />
          {model.actions.map((action) => (
            <ConnectorActionButton
              key={action.kind}
              action={action}
              disabled={disabled}
              onPlug={onPlug}
              onStartCharging={onStartCharging}
              onStopCharging={onStopCharging}
              onUnplug={onUnplug}
            />
          ))}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 xl:grid-cols-[13rem_minmax(20rem,1fr)_minmax(20rem,1fr)]">
          <div className="grid gap-2">
            {model.fields.map((field) => (
              <ConnectorField key={field.label} field={field} />
            ))}
          </div>
          <ConnectorElectricalChart samples={samples} />
          <ConnectorEnergyChart samples={samples} />
        </div>
        {model.issue && (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              model.issue.tone === "warning" &&
                "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
              model.issue.tone === "destructive" &&
                "border-destructive/25 bg-destructive/10 text-destructive",
            )}
          >
            {model.issue.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectorField({
  field,
}: {
  field: ConnectorCardModel["fields"][number];
}) {
  return (
    <dl
      className={cn(
        "min-w-0 rounded-lg bg-muted/40 px-3 py-2",
        field.span === "full" && "col-span-full",
      )}
    >
      <dt className="text-xs text-muted-foreground">{field.label}</dt>
      <dd
        className={cn(
          "mt-1 truncate text-sm font-medium",
          field.tone === "success" && "text-emerald-700 dark:text-emerald-300",
          field.tone === "waiting" && "text-sky-700 dark:text-sky-300",
          field.tone === "warning" && "text-amber-700 dark:text-amber-300",
          field.tone === "destructive" && "text-destructive",
        )}
      >
        {field.value}
      </dd>
    </dl>
  );
}

const ELECTRICAL_CHART_CONFIG = {
  powerW: {
    label: "功率 kW",
    color: "#0284c7",
  },
  currentA: {
    label: "电流 A",
    color: "#059669",
  },
  voltageV: {
    label: "电压 V",
    color: "#d97706",
  },
} satisfies ChartConfig;

const ELECTRICAL_CHART_SERIES = [
  { dataKey: "powerW", label: "功率", unit: "kW" },
  { dataKey: "currentA", label: "电流", unit: "A" },
  { dataKey: "voltageV", label: "电压", unit: "V" },
] as const;

const ENERGY_CHART_CONFIG = {
  meterKwh: {
    label: "电量 kWh",
    color: "#7c3aed",
  },
} satisfies ChartConfig;

function ConnectorElectricalChart({ samples }: { samples: ChargingSamplePoint[] }) {
  return (
    <ConnectorChartPanel title="功率 / 电流 / 电压曲线" empty={samples.length === 0}>
      <div className="flex h-40 flex-col gap-2">
        {ELECTRICAL_CHART_SERIES.map((series) => (
          <ConnectorElectricalMetricChart
            key={series.dataKey}
            dataKey={series.dataKey}
            label={series.label}
            samples={samples}
            unit={series.unit}
          />
        ))}
      </div>
    </ConnectorChartPanel>
  );
}

function ConnectorElectricalMetricChart({
  dataKey,
  label,
  samples,
  unit,
}: {
  dataKey: (typeof ELECTRICAL_CHART_SERIES)[number]["dataKey"];
  label: string;
  samples: ChargingSamplePoint[];
  unit: string;
}) {
  const latestValue = samples[samples.length - 1]?.[dataKey];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-xs font-medium tabular-nums">
          {formatElectricalMetricValue(latestValue, dataKey, unit)}
        </div>
      </div>
      <ChartContainer
        className="aspect-auto h-full min-h-0 w-full"
        config={ELECTRICAL_CHART_CONFIG}
      >
        <LineChart
          accessibilityLayer
          data={samples}
          margin={{ left: 0, right: 6, top: 4, bottom: 4 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="sampledAt"
            hide
          />
          <YAxis domain={getElectricalMetricDomain(samples, dataKey)} hide />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {formatElectricalMetricValue(value, dataKey, unit)}
                    </span>
                  </>
                )}
                labelFormatter={(value) => formatChartTime(String(value))}
              />
            }
          />
          <Line
            dataKey={dataKey}
            dot={samples.length <= 8}
            stroke={`var(--color-${dataKey})`}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

function ConnectorEnergyChart({ samples }: { samples: ChargingSamplePoint[] }) {
  const energySamples = toEnergyChartSamples(samples);

  return (
    <ConnectorChartPanel title="电量曲线" empty={samples.length === 0}>
      <ChartContainer
        className="aspect-auto h-40 w-full"
        config={ENERGY_CHART_CONFIG}
      >
        <LineChart
          accessibilityLayer
          data={energySamples}
          margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="sampledAt"
            minTickGap={24}
            tickFormatter={formatChartTime}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            domain={getEnergyChartDomain(samples)}
            tickFormatter={formatEnergyAxisTick}
            tickLine={false}
            width={54}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <>
                    <span className="text-muted-foreground">电量</span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {formatEnergyTooltipValue(value)}
                    </span>
                  </>
                )}
                labelFormatter={(value) => formatChartTime(String(value))}
              />
            }
          />
          <Line
            dataKey="meterKwh"
            dot={samples.length <= 8}
            stroke="var(--color-meterKwh)"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ChartContainer>
    </ConnectorChartPanel>
  );
}

function ConnectorChartPanel({
  children,
  empty,
  title,
}: {
  children: ReactNode;
  empty: boolean;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border/40 p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {empty ? (
        <div className="mt-2 flex h-40 items-center justify-center rounded-md border border-dashed border-border/60 text-sm text-muted-foreground">
          暂无充电采样
        </div>
      ) : (
        <div className="mt-2">{children}</div>
      )}
    </section>
  );
}

function formatChartTime(value: string) {
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) {
    return value;
  }

  return time.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatElectricalMetricValue(
  value: string | number | undefined,
  dataKey: (typeof ELECTRICAL_CHART_SERIES)[number]["dataKey"],
  unit: string,
) {
  if (value === undefined) {
    return "暂无";
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return `${value} ${unit}`;
  }

  if (dataKey === "powerW") {
    return `${(numericValue / 1000).toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${unit}`;
  }

  return `${numericValue.toLocaleString("zh-CN", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

function toEnergyChartSamples(samples: ChargingSamplePoint[]) {
  return samples.map((sample) => ({
    ...sample,
    meterKwh: sample.meterWh / 1000,
  }));
}

function formatEnergyAxisTick(value: number) {
  return `${Math.round(value).toLocaleString("zh-CN")} kWh`;
}

function formatEnergyTooltipValue(value: string | number) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return `${value} kWh`;
  }

  return `${numericValue.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kWh`;
}

function getElectricalMetricDomain(
  samples: ChargingSamplePoint[],
  dataKey: (typeof ELECTRICAL_CHART_SERIES)[number]["dataKey"],
) {
  const values = samples
    .map((sample) => sample[dataKey])
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return [0, 1];
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;
  const padding =
    range === 0 ? Math.max(Math.abs(maxValue) * 0.05, 1) : range * 0.15;

  return [Math.max(0, minValue - padding), maxValue + padding];
}

function getEnergyChartDomain(samples: ChargingSamplePoint[]) {
  const firstSample = samples[0];
  if (firstSample === undefined) {
    return [0, 1];
  }

  const firstMeterKwh = firstSample.meterWh / 1000;
  const maxMeterKwh = Math.max(...samples.map((sample) => sample.meterWh / 1000));
  const range = maxMeterKwh - firstMeterKwh;
  const topPadding =
    range === 0 ? Math.max(Math.abs(firstMeterKwh) * 0.05, 1) : range * 0.05;

  return [firstMeterKwh, maxMeterKwh + topPadding];
}

function RuntimeObservationTabs({
  events,
  protocolMessages,
}: {
  events: RuntimeEventLogEntry[];
  protocolMessages: ProtocolMessageLogEntry[];
}) {
  const [activeObservationTab, setActiveObservationTab] =
    useState<RuntimeObservationTab>("messages");
  const [messageTimeFilter, setMessageTimeFilter] =
    useState<RuntimeLogTimeFilter>("all");
  const [eventTimeFilter, setEventTimeFilter] =
    useState<RuntimeLogTimeFilter>("all");
  const [messageTypeFilter, setMessageTypeFilter] = useState(
    ALL_RUNTIME_LOG_TYPE_FILTER,
  );
  const [eventTypeFilter, setEventTypeFilter] = useState(
    ALL_RUNTIME_LOG_TYPE_FILTER,
  );
  const [messagesPinned, setMessagesPinned] = useState(false);
  const [eventsPinned, setEventsPinned] = useState(false);
  const messagesListHandleRef = useRef<RuntimeLogListHandle | null>(null);
  const eventsListHandleRef = useRef<RuntimeLogListHandle | null>(null);
  const filterNowMs = Date.now();
  const messageTypeOptions = useMemo(
    () =>
      buildRuntimeLogTypeFilterOptions(
        protocolMessages,
        (message) => message.action,
      ),
    [protocolMessages],
  );
  const eventTypeOptions = useMemo(
    () =>
      buildRuntimeLogTypeFilterOptions(
        events,
        (event) => event.eventType,
      ),
    [events],
  );
  const filteredProtocolMessages = useMemo(
    () =>
      filterRuntimeLogEntries(protocolMessages, {
        getType: (message) => message.action,
        nowMs: filterNowMs,
        timeFilter: messageTimeFilter,
        typeFilter: messageTypeFilter,
      }),
    [filterNowMs, messageTimeFilter, messageTypeFilter, protocolMessages],
  );
  const filteredEvents = useMemo(
    () =>
      filterRuntimeLogEntries(events, {
        getType: (event) => event.eventType,
        nowMs: filterNowMs,
        timeFilter: eventTimeFilter,
        typeFilter: eventTypeFilter,
      }),
    [eventTimeFilter, eventTypeFilter, events, filterNowMs],
  );
  const activeListHandleRef =
    activeObservationTab === "messages" ? messagesListHandleRef : eventsListHandleRef;
  const activeListPinned =
    activeObservationTab === "messages" ? messagesPinned : eventsPinned;
  const activeListLength =
    activeObservationTab === "messages" ? protocolMessages.length : events.length;
  const activeTimeFilter =
    activeObservationTab === "messages" ? messageTimeFilter : eventTimeFilter;
  const activeTypeFilter =
    activeObservationTab === "messages" ? messageTypeFilter : eventTypeFilter;
  const activeTypeOptions =
    activeObservationTab === "messages" ? messageTypeOptions : eventTypeOptions;

  function handleActiveTimeFilterChange(timeFilter: RuntimeLogTimeFilter) {
    activeListHandleRef.current?.resetToTop();
    if (activeObservationTab === "messages") {
      setMessagesPinned(false);
      setMessageTimeFilter(timeFilter);
      return;
    }

    setEventsPinned(false);
    setEventTimeFilter(timeFilter);
  }

  function handleActiveTypeFilterChange(typeFilter: string) {
    activeListHandleRef.current?.resetToTop();
    if (activeObservationTab === "messages") {
      setMessagesPinned(false);
      setMessageTypeFilter(typeFilter);
      return;
    }

    setEventsPinned(false);
    setEventTypeFilter(typeFilter);
  }

  return (
    <section className="rounded-lg border border-border/60 bg-card p-3">
      <Tabs
        value={activeObservationTab}
        onValueChange={(value) =>
          setActiveObservationTab(value as RuntimeObservationTab)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="messages">
              报文 {filteredProtocolMessages.length}
            </TabsTrigger>
            <TabsTrigger value="events">事件 {filteredEvents.length}</TabsTrigger>
          </TabsList>
          <RuntimeObservationToolbar
            disabled={activeListLength === 0}
            pinned={activeListPinned}
            timeFilter={activeTimeFilter}
            typeFilter={activeTypeFilter}
            typeOptions={activeTypeOptions}
            onPinnedToggle={() => activeListHandleRef.current?.togglePinned()}
            onTimeFilterChange={handleActiveTimeFilterChange}
            onTypeFilterChange={handleActiveTypeFilterChange}
          />
        </div>
        <TabsContent className="mt-3" value="messages">
          <ProtocolMessageLogList
            entries={filteredProtocolMessages}
            entriesCount={protocolMessages.length}
            listHandleRef={messagesListHandleRef}
            pinned={messagesPinned}
            onPinnedChange={setMessagesPinned}
          />
        </TabsContent>
        <TabsContent className="mt-3" value="events">
          <RuntimeEventLogList
            entries={filteredEvents}
            entriesCount={events.length}
            listHandleRef={eventsListHandleRef}
            pinned={eventsPinned}
            onPinnedChange={setEventsPinned}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

type RuntimeObservationTab = "messages" | "events";

function RuntimeObservationToolbar({
  disabled,
  pinned,
  timeFilter,
  typeFilter,
  typeOptions,
  onPinnedToggle,
  onTimeFilterChange,
  onTypeFilterChange,
}: {
  disabled: boolean;
  pinned: boolean;
  timeFilter: RuntimeLogTimeFilter;
  typeFilter: string;
  typeOptions: RuntimeLogTypeFilterOption[];
  onPinnedToggle(): void;
  onTimeFilterChange(timeFilter: RuntimeLogTimeFilter): void;
  onTypeFilterChange(typeFilter: string): void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select
        disabled={disabled}
        value={timeFilter}
        onValueChange={(value) =>
          onTimeFilterChange(value as RuntimeLogTimeFilter)}
      >
        <SelectTrigger aria-label="时间筛选" size="sm">
          <SelectValue placeholder="时间筛选" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {RUNTIME_LOG_TIME_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        disabled={disabled}
        value={typeFilter}
        onValueChange={onTypeFilterChange}
      >
        <SelectTrigger aria-label="类型筛选" size="sm">
          <SelectValue placeholder="类型筛选" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {typeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={pinned ? "取消滚动钉住" : "滚动钉住"}
            aria-pressed={pinned}
            size="icon-sm"
            type="button"
            variant={pinned ? "secondary" : "outline"}
            onClick={onPinnedToggle}
          >
            <PinIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {pinned ? "取消滚动钉住" : "滚动钉住"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function ConnectorEditButton({
  configurationLocked,
  configurationLockedReason,
  label,
  onEdit,
}: {
  configurationLocked: boolean;
  configurationLockedReason?: string;
  label: string;
  onEdit(): void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            aria-label={label}
            disabled={configurationLocked}
            type="button"
            variant="outline"
            onClick={onEdit}
          >
            <PencilIcon data-icon="inline-start" />
            编辑
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {configurationLockedReason ?? "编辑枪口"}
      </TooltipContent>
    </Tooltip>
  );
}

function RuntimeEventLogList({
  entries,
  entriesCount,
  listHandleRef,
  pinned,
  onPinnedChange,
}: {
  entries: RuntimeEventLogEntry[];
  entriesCount: number;
  listHandleRef: Ref<RuntimeLogListHandle>;
  pinned: boolean;
  onPinnedChange(pinned: boolean): void;
}) {
  return (
    <VirtualRuntimeLogList
      entries={entries}
      emptyText={getRuntimeLogEmptyText({
        emptyText: "暂无事件",
        entriesCount,
        filteredEmptyText: "没有匹配筛选条件的事件",
      })}
      listHandleRef={listHandleRef}
      pinned={pinned}
      onPinnedChange={onPinnedChange}
      renderRow={(entry) => <RuntimeEventLogRow entry={entry} />}
    />
  );
}

function ProtocolMessageLogList({
  entries,
  entriesCount,
  listHandleRef,
  pinned,
  onPinnedChange,
}: {
  entries: ProtocolMessageLogEntry[];
  entriesCount: number;
  listHandleRef: Ref<RuntimeLogListHandle>;
  pinned: boolean;
  onPinnedChange(pinned: boolean): void;
}) {
  return (
    <VirtualRuntimeLogList
      entries={entries}
      emptyText={getRuntimeLogEmptyText({
        emptyText: "暂无报文",
        entriesCount,
        filteredEmptyText: "没有匹配筛选条件的报文",
      })}
      listHandleRef={listHandleRef}
      pinned={pinned}
      onPinnedChange={onPinnedChange}
      renderRow={(entry) => <ProtocolMessageLogRow entry={entry} />}
    />
  );
}

interface RuntimeLogListEntry {
  id: string;
}

interface RuntimeLogScrollAnchor {
  id: string;
  offset: number;
  scrollTop: number;
}

interface RuntimeLogListHandle {
  resetToTop(): void;
  togglePinned(): void;
}

const RUNTIME_LOG_TOP_THRESHOLD = 8;

function VirtualRuntimeLogList<TEntry extends RuntimeLogListEntry>({
  entries,
  emptyText,
  listHandleRef,
  pinned,
  onPinnedChange,
  renderRow,
}: {
  entries: TEntry[];
  emptyText: string;
  listHandleRef: Ref<RuntimeLogListHandle>;
  pinned: boolean;
  onPinnedChange(pinned: boolean): void;
  renderRow(entry: TEntry): ReactNode;
}) {
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<RuntimeLogScrollAnchor | null>(null);
  const previousEntriesRef = useRef(entries);
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: entries.length,
    estimateSize: () => 48,
    getItemKey: (index) => entries[index]?.id ?? index,
    getScrollElement: () => scrollParentRef.current,
    overscan: 10,
    useAnimationFrameWithResizeObserver: true,
  });

  const updateAnchor = useCallback(() => {
    const scrollElement = scrollParentRef.current;
    if (scrollElement === null || entries.length === 0) {
      anchorRef.current = null;
      return;
    }

    const scrollTop = scrollElement.scrollTop;
    const firstVisibleItem =
      rowVirtualizer.getVirtualItemForOffset(scrollTop) ??
      rowVirtualizer.getVirtualItems()[0];
    const entry = entries[firstVisibleItem?.index ?? -1];
    if (firstVisibleItem === undefined || entry === undefined) {
      anchorRef.current = null;
      return;
    }

    anchorRef.current = {
      id: entry.id,
      offset: Math.max(0, scrollTop - firstVisibleItem.start),
      scrollTop,
    };
  }, [entries, rowVirtualizer]);

  useLayoutEffect(() => {
    const previousEntries = previousEntriesRef.current;
    const anchor = anchorRef.current;
    const shouldKeepAnchor =
      pinned || (anchor?.scrollTop ?? 0) > RUNTIME_LOG_TOP_THRESHOLD;

    if (entries.length > previousEntries.length && anchor && shouldKeepAnchor) {
      const targetIndex = entries.findIndex((entry) => entry.id === anchor.id);
      if (targetIndex >= 0) {
        const targetOffset = rowVirtualizer.getOffsetForIndex(targetIndex, "start");
        if (targetOffset !== undefined) {
          rowVirtualizer.scrollToOffset(
            Math.max(0, targetOffset[0] + anchor.offset),
            { behavior: "auto" },
          );
        }
      }
    }

    previousEntriesRef.current = entries;
  }, [entries, pinned, rowVirtualizer]);

  useLayoutEffect(() => {
    updateAnchor();
  }, [updateAnchor]);

  const handlePinnedChange = useCallback(() => {
    if (!pinned) {
      updateAnchor();
      onPinnedChange(true);
      return;
    }

    onPinnedChange(false);
    rowVirtualizer.scrollToIndex(0, { align: "start" });
  }, [onPinnedChange, pinned, rowVirtualizer, updateAnchor]);

  const resetToTop = useCallback(() => {
    onPinnedChange(false);
    rowVirtualizer.scrollToIndex(0, { align: "start" });
  }, [onPinnedChange, rowVirtualizer]);

  useImperativeHandle(
    listHandleRef,
    () => ({
      resetToTop,
      togglePinned: handlePinnedChange,
    }),
    [handlePinnedChange, resetToTop],
  );

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div>
      <div
        ref={scrollParentRef}
        className="h-[min(60vh,640px)] min-h-80 overflow-auto rounded-lg border border-border/40"
        onScroll={updateAnchor}
      >
        {entries.length === 0 ? (
          <RuntimeLogEmptyState text={emptyText} />
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualItem) => {
              const entry = entries[virtualItem.index];
              if (entry === undefined) {
                return null;
              }

              return (
                <div
                  key={virtualItem.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualItem.index}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {renderRow(entry)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RuntimeEventLogRow({ entry }: { entry: RuntimeEventLogEntry }) {
  return (
    <details className="group border-b border-border/40">
      <summary className="grid cursor-pointer grid-cols-[5.5rem_minmax(8rem,0.9fr)_minmax(6rem,0.7fr)_minmax(8rem,1fr)_minmax(0,1.4fr)] gap-3 px-3 py-2 text-sm hover:bg-muted/40">
        <span className="text-xs text-muted-foreground">
          {formatLogTime(entry.occurredAt)}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {entry.eventType}
        </span>
        <span className="truncate text-muted-foreground">{entry.resource}</span>
        <span className="truncate font-medium">{entry.summary}</span>
        <span className="truncate font-mono text-xs text-muted-foreground group-open:hidden">
          {formatRuntimeLogPreview(entry.detail)}
        </span>
      </summary>
      <RuntimeLogJsonBlock value={entry.detail} />
    </details>
  );
}

function ProtocolMessageLogRow({ entry }: { entry: ProtocolMessageLogEntry }) {
  return (
    <details className="group border-b border-border/40">
      <summary className="grid cursor-pointer grid-cols-[5.5rem_4rem_minmax(8rem,0.8fr)_minmax(8rem,1fr)_minmax(0,1.6fr)] gap-3 px-3 py-2 text-sm hover:bg-muted/40">
        <span className="text-xs text-muted-foreground">
          {formatLogTime(entry.occurredAt)}
        </span>
        <ProtocolDirectionBadge direction={entry.direction} />
        <span className="truncate font-medium">{entry.action}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {entry.messageId}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground group-open:hidden">
          {formatRuntimeLogPreview(entry.detail)}
        </span>
      </summary>
      <RuntimeLogJsonBlock value={entry.detail} />
    </details>
  );
}

function ProtocolDirectionBadge({
  direction,
}: {
  direction: ProtocolMessageLogEntry["direction"];
}) {
  const DirectionIcon = direction === "received" ? ArrowLeftIcon : ArrowRightIcon;

  return (
    <Badge
      className={cn(
        "w-fit bg-transparent",
        direction === "received"
          ? "border-sky-500 text-sky-700 dark:border-sky-400 dark:text-sky-300"
          : "border-emerald-500 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300",
      )}
      variant="outline"
    >
      <DirectionIcon data-icon="inline-start" />
      {direction === "received" ? "收到" : "发送"}
    </Badge>
  );
}

function RuntimeLogJsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto border-t border-border/40 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function formatRuntimeLogPreview(value: unknown) {
  const preview = JSON.stringify(value);
  return preview ?? String(value);
}

function RuntimeLogEmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 px-3 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function formatLogTime(occurredAt: string) {
  return new Date(occurredAt).toLocaleTimeString("zh-CN", {
    hour12: false,
  });
}

function ConnectorActionButton({
  action,
  disabled,
  onPlug,
  onStartCharging,
  onStopCharging,
  onUnplug,
}: {
  action: ConnectorCardAction;
  disabled: boolean;
  onPlug(): void;
  onStartCharging(idTag: string): void;
  onStopCharging(transactionId: string): void;
  onUnplug(): void;
}) {
  if (action.kind === "plug") {
    return (
      <Button disabled={disabled} type="button" onClick={onPlug}>
        <PlugZapIcon />
        {action.label}
      </Button>
    );
  }

  if (action.kind === "unplug") {
    return (
      <Button
        disabled={disabled}
        type="button"
        variant="outline"
        onClick={onUnplug}
      >
        <UnplugIcon />
        {action.label}
      </Button>
    );
  }

  if (action.kind === "startCharging") {
    return (
      <StartChargingDialog
        disabled={disabled}
        label={action.label}
        onSubmit={onStartCharging}
      />
    );
  }

  return (
    <StopChargingDialog
      action={action}
      disabled={disabled}
      onConfirm={onStopCharging}
    />
  );
}

function StartChargingDialog({
  disabled,
  label,
  onSubmit,
}: {
  disabled: boolean;
  label: string;
  onSubmit(idTag: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [idTag, setIdTag] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedIdTag = idTag.trim();
    if (trimmedIdTag.length === 0) {
      toast.error("请输入 idTag");
      return;
    }

    onSubmit(trimmedIdTag);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} type="button">
          <PlayIcon />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>启动充电</DialogTitle>
            <DialogDescription>
              使用 idTag 发起 StartTransaction，鉴权结果由 CSMS 决定。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="start-charging-id-tag">idTag</Label>
            <Input
              id="start-charging-id-tag"
              maxLength={20}
              value={idTag}
              onChange={(event) => setIdTag(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button disabled={disabled} type="submit">
              <PlayIcon />
              启动充电
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StopChargingDialog({
  action,
  disabled,
  onConfirm,
}: {
  action: ConnectorCardAction;
  disabled: boolean;
  onConfirm(transactionId: string): void;
}) {
  const transactionId = action.transactionId;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled || transactionId === undefined} type="button">
          <SquareIcon />
          {action.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>停止充电</AlertDialogTitle>
          <AlertDialogDescription>
            将发送 StopTransaction，停止原因和停止表值使用默认逻辑。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (transactionId !== undefined) {
                onConfirm(transactionId);
              }
            }}
          >
            <SquareIcon />
            停止充电
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StatusBadge({
  item,
}: {
  item: ChargingPointDetailHeaderModel["mainStatus"];
}) {
  const badge = (
    <Badge
      className={toBadgeToneClassName(item.tone)}
      variant={toBadgeVariant(item.tone)}
    >
      {item.label}
    </Badge>
  );

  if (!item.description) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{item.description}</TooltipContent>
    </Tooltip>
  );
}

function toBadgeVariant(
  tone: "neutral" | "success" | "waiting" | "warning" | "destructive",
): "default" | "secondary" | "destructive" | "outline" {
  if (tone === "destructive") {
    return "destructive";
  }

  if (tone === "success") {
    return "default";
  }

  if (tone === "neutral") {
    return "outline";
  }

  return "secondary";
}

function toBadgeToneClassName(
  tone: "neutral" | "success" | "waiting" | "warning" | "destructive",
) {
  if (tone === "success") {
    return "border-emerald-600/20 bg-emerald-600 text-white [a]:hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950";
  }

  return undefined;
}

function DetailState({
  className,
  text,
}: {
  className?: string;
  text: string;
}) {
  return (
    <Card className={className}>
      <CardContent>{text}</CardContent>
    </Card>
  );
}
