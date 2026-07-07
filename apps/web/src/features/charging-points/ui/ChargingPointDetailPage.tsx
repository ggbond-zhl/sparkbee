import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type {
  ChargingPointDetailResponse,
  ConnectorResponse,
  RuntimeOperationResponse,
} from "@spark-bee/contracts";
import {
  PencilIcon,
  PlayIcon,
  PlugZapIcon,
  SquareIcon,
  UnplugIcon,
} from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
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
  plugConnector,
  startConnectorTransaction,
  startChargingPoint,
  stopConnectorTransaction,
  stopChargingPoint,
  unplugConnector,
} from "@/features/charging-points/api/chargingPoints";
import {
  buildConnectorCardModels,
  type ConnectorCardAction,
  type ConnectorCardModel,
} from "@/features/charging-points/model/chargingPointConnectorCards";
import {
  buildChargingPointDetailHeaderModel,
  type ChargingPointDetailHeaderModel,
  type HeaderMetricItem,
  type RuntimeStatusQueryState,
} from "@/features/charging-points/model/chargingPointDetailHeader";
import type {
  ProtocolMessageLogEntry,
  RuntimeEventLogEntry,
} from "@/features/charging-points/model/chargingPointRuntimeEvents";
import {
  chargingPointDetailQueryOptions,
  chargingPointDetailQueryKey,
  chargingPointRuntimeStatusQueryKey,
  chargingPointRuntimeStatusQueryOptions,
} from "@/features/charging-points/model/chargingPointQueries";
import { useChargingPointRuntimeEvents } from "@/features/charging-points/model/useChargingPointRuntimeEvents";
import { ChargingPointConnectorEditDialog } from "@/features/charging-points/ui/ChargingPointConnectorEditDialog";
import { ChargingPointEditDialog } from "@/features/charging-points/ui/ChargingPointEditDialog";
import { cn } from "@/lib/utils";

export function ChargingPointDetailPage() {
  const { chargingPointId } = useParams({
    from: "/charging-points/$chargingPointId",
  });
  const [editOpen, setEditOpen] = useState(false);
  const [connectorEditTarget, setConnectorEditTarget] =
    useState<ConnectorResponse | null>(null);
  const queryClient = useQueryClient();
  const detailQuery = useQuery(chargingPointDetailQueryOptions(chargingPointId));
  const detailQueryKey = chargingPointDetailQueryKey(chargingPointId);
  const runtimeStatusQuery = useQuery(
    chargingPointRuntimeStatusQueryOptions(chargingPointId),
  );
  const runtimeStatusQueryState = toRuntimeStatusQueryState(runtimeStatusQuery);
  const syncRuntimeStatus = useCallback((runtimeStatus: RuntimeOperationResponse) => {
    queryClient.setQueryData<RuntimeOperationResponse>(
      chargingPointRuntimeStatusQueryKey(chargingPointId),
      runtimeStatus,
    );
  }, [chargingPointId, queryClient]);
  const { eventFeedState, runtimeEventState } = useChargingPointRuntimeEvents(chargingPointId, {
    enabled: detailQuery.isSuccess,
    onRuntimeStatus: syncRuntimeStatus,
  });
  const startMutation = useMutation({
    mutationFn: () => startChargingPoint(chargingPointId),
    onSuccess: (runtimeStatus) => {
      queryClient.setQueryData(
        chargingPointRuntimeStatusQueryKey(chargingPointId),
        runtimeStatus,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "桩实例启动失败");
    },
  });
  const stopMutation = useMutation({
    mutationFn: () => stopChargingPoint(chargingPointId),
    onSuccess: (runtimeStatus) => {
      queryClient.setQueryData(
        chargingPointRuntimeStatusQueryKey(chargingPointId),
        runtimeStatus,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "桩实例停止失败");
    },
  });
  const plugMutation = useMutation({
    mutationFn: (connectorId: string) => plugConnector(chargingPointId, connectorId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "插枪失败");
    },
  });
  const unplugMutation = useMutation({
    mutationFn: (connectorId: string) => unplugConnector(chargingPointId, connectorId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "拔枪失败");
    },
  });
  const startTransactionMutation = useMutation({
    mutationFn: ({ connectorId, idTag }: { connectorId: string; idTag: string }) =>
      startConnectorTransaction(chargingPointId, connectorId, { idTag }),
    onSuccess: (result) => {
      if (result.status === "accepted") {
        toast.success("充电已启动");
        return;
      }

      toast.error(result.reason);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "启动充电失败");
    },
  });
  const stopTransactionMutation = useMutation({
    mutationFn: ({
      connectorId,
      transactionId,
    }: {
      connectorId: string;
      transactionId: string;
    }) => stopConnectorTransaction(chargingPointId, connectorId, { transactionId }),
    onSuccess: (result) => {
      if (result.status === "accepted") {
        toast.success("充电已停止");
        return;
      }

      toast.error(result.errorMessage);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "停止充电失败");
    },
  });

  if (detailQuery.isLoading) {
    return <DetailState text="桩实例详情加载中" />;
  }

  if (detailQuery.isError || detailQuery.data === undefined) {
    return <DetailState className="text-destructive" text="桩实例详情加载失败" />;
  }

  const headerModel = buildChargingPointDetailHeaderModel({
    detail: detailQuery.data,
    runtimeStatus: runtimeStatusQuery.data,
    statusQueryState: runtimeStatusQueryState,
    lastHeartbeatAt: null,
    runtimeEventState,
  });
  const connectorCardModels = buildConnectorCardModels({
    connectors: detailQuery.data.connectors,
    runtimeStatus: runtimeStatusQuery.data,
    runtimeEventState,
  });
  const runtimeMutationPending = startMutation.isPending || stopMutation.isPending;
  const connectorMutationPending =
    plugMutation.isPending ||
    unplugMutation.isPending ||
    startTransactionMutation.isPending ||
    stopTransactionMutation.isPending;
  const configurationLocked =
    runtimeStatusQueryState !== "success" ||
    runtimeStatusQuery.data?.status !== "stopped";
  const configurationLockedReason = configurationLocked
    ? runtimeStatusQueryState === "success"
      ? "桩实例未停止时仅可修改名称和说明；连接配置需停止后修改。"
      : "运行状态未确认，仅可修改名称和说明；连接配置需停止后修改。"
    : undefined;
  const connectorEditLockedReason = configurationLocked
    ? runtimeStatusQueryState === "success"
      ? "请先停止桩实例再编辑枪口配置。"
      : "运行状态未确认，暂不可编辑枪口配置。"
    : undefined;

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{detailQuery.data.name}</CardTitle>
              <StatusBadge item={headerModel.mainStatus} />
              <StatusBadge item={headerModel.chargingPointStatus} />
              <span className="text-xs text-muted-foreground">
                {headerModel.lastHeartbeatLabel}
              </span>
            </div>
          </div>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              <PencilIcon data-icon="inline-start" />
              编辑
            </Button>
            <Button
              disabled={headerModel.primaryAction.disabled || runtimeMutationPending}
              type="button"
              variant={headerModel.primaryAction.kind === "stop" ? "destructive" : "default"}
              onClick={() => {
                if (headerModel.primaryAction.kind === "start") {
                  startMutation.mutate();
                  return;
                }

                stopMutation.mutate();
              }}
            >
              {runtimeMutationPending ? "处理中" : headerModel.primaryAction.label}
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

          <RuntimeDiagnosticsPanel items={headerModel.runtimeDiagnostics} />

          {headerModel.primaryAction.disabledReason && (
            <p className="text-sm text-muted-foreground">
              {headerModel.primaryAction.disabledReason}
            </p>
          )}
        </CardContent>
      </Card>
      <section className="grid gap-3">
        {connectorCardModels.map((model) => (
          <ConnectorRuntimeCard
            key={model.connectorId}
            configurationLocked={configurationLocked}
            configurationLockedReason={connectorEditLockedReason}
            disabled={connectorMutationPending}
            model={model}
            onEdit={() => setConnectorEditTarget(model.connector)}
            onPlug={() => plugMutation.mutate(model.connectorId)}
            onStartCharging={(idTag) =>
              startTransactionMutation.mutate({
                connectorId: model.connectorId,
                idTag,
              })}
            onStopCharging={(transactionId) =>
              stopTransactionMutation.mutate({
                connectorId: model.connectorId,
                transactionId,
              })}
            onUnplug={() => unplugMutation.mutate(model.connectorId)}
          />
        ))}
      </section>
      <RuntimeObservationTabs
        events={eventFeedState.events}
        protocolMessages={eventFeedState.protocolMessages}
      />
      <ChargingPointEditDialog
        configurationLocked={configurationLocked}
        configurationLockedReason={configurationLockedReason}
        item={detailQuery.data}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={async (updatedItem) => {
          queryClient.setQueryData(detailQueryKey, updatedItem);
          await queryClient.invalidateQueries({ queryKey: detailQueryKey });
        }}
      />
      {connectorEditTarget && (
        <ChargingPointConnectorEditDialog
          chargingPointId={chargingPointId}
          configurationLocked={configurationLocked}
          configurationLockedReason={connectorEditLockedReason}
          connector={connectorEditTarget}
          open={connectorEditTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setConnectorEditTarget(null);
            }
          }}
          onSaved={async (savedConnector) => {
            queryClient.setQueryData<ChargingPointDetailResponse>(
              detailQueryKey,
              (current) => {
                if (current === undefined) {
                  return current;
                }

                return {
                  ...current,
                  connectors: current.connectors.map((connector) =>
                    connector.id === savedConnector.id ? savedConnector : connector,
                  ),
                };
              },
            );
            await queryClient.invalidateQueries({ queryKey: detailQueryKey });
          }}
        />
      )}
    </section>
  );
}

function toRuntimeStatusQueryState(query: {
  isError: boolean;
  isLoading: boolean;
}): RuntimeStatusQueryState {
  if (query.isLoading) {
    return "loading";
  }

  return query.isError ? "error" : "success";
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

function RuntimeDiagnosticsPanel({ items }: { items: HeaderMetricItem[] }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">运行诊断</h3>
        <span className="text-xs text-muted-foreground">通信状态</span>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
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
  onEdit(): void;
  onPlug(): void;
  onStartCharging(idTag: string): void;
  onStopCharging(transactionId: string): void;
  onUnplug(): void;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-1.5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className="truncate text-base">{model.title}</CardTitle>
              <Badge
                className={toBadgeToneClassName(model.statusBadge.tone)}
                variant={toBadgeVariant(model.statusBadge.tone)}
              >
                {model.statusBadge.label}
              </Badge>
            </div>
            <CardDescription className="mt-1 truncate">
              {model.description}
            </CardDescription>
          </div>
          <ConnectorEditButton
            configurationLocked={configurationLocked}
            configurationLockedReason={configurationLockedReason}
            label={`编辑${model.title}`}
            onEdit={onEdit}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {model.fields.map((field) => (
            <ConnectorField key={field.label} field={field} />
          ))}
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
        <div className="flex flex-wrap gap-2">
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
        </div>
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
    <dl className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
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

function RuntimeObservationTabs({
  events,
  protocolMessages,
}: {
  events: RuntimeEventLogEntry[];
  protocolMessages: ProtocolMessageLogEntry[];
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-3">
      <Tabs defaultValue="messages">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="messages">报文 {protocolMessages.length}</TabsTrigger>
            <TabsTrigger value="events">事件 {events.length}</TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground">
            当前页面打开后收到的最近 200 条
          </span>
        </div>
        <TabsContent className="mt-3" value="messages">
          <ProtocolMessageLogList entries={protocolMessages} />
        </TabsContent>
        <TabsContent className="mt-3" value="events">
          <RuntimeEventLogList entries={events} />
        </TabsContent>
      </Tabs>
    </section>
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
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={onEdit}
          >
            <PencilIcon />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {configurationLockedReason ?? "编辑枪口"}
      </TooltipContent>
    </Tooltip>
  );
}

function RuntimeEventLogList({ entries }: { entries: RuntimeEventLogEntry[] }) {
  if (entries.length === 0) {
    return <RuntimeLogEmptyState text="暂无事件" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/40">
      {entries.map((entry) => (
        <details
          key={entry.id}
          className="group border-b border-border/40 last:border-b-0"
        >
          <summary className="grid cursor-pointer grid-cols-[5.5rem_minmax(8rem,0.9fr)_minmax(6rem,0.7fr)_minmax(0,1.6fr)] gap-3 px-3 py-2 text-sm hover:bg-muted/40">
            <span className="text-xs text-muted-foreground">
              {formatLogTime(entry.occurredAt)}
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {entry.eventType}
            </span>
            <span className="truncate text-muted-foreground">{entry.resource}</span>
            <span className="truncate font-medium">{entry.summary}</span>
          </summary>
          <RuntimeLogJsonBlock value={entry.detail} />
        </details>
      ))}
    </div>
  );
}

function ProtocolMessageLogList({
  entries,
}: {
  entries: ProtocolMessageLogEntry[];
}) {
  if (entries.length === 0) {
    return <RuntimeLogEmptyState text="暂无报文" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/40">
      {entries.map((entry) => (
        <details
          key={entry.id}
          className="group border-b border-border/40 last:border-b-0"
        >
          <summary className="grid cursor-pointer grid-cols-[5.5rem_4rem_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(0,1.2fr)] gap-3 px-3 py-2 text-sm hover:bg-muted/40">
            <span className="text-xs text-muted-foreground">
              {formatLogTime(entry.occurredAt)}
            </span>
            <Badge
              className={cn(
                "w-fit",
                entry.direction === "received" &&
                  "border-sky-600/20 bg-sky-600 text-white dark:bg-sky-500 dark:text-sky-950",
              )}
              variant={entry.direction === "received" ? "default" : "outline"}
            >
              {entry.direction === "received" ? "收到" : "发送"}
            </Badge>
            <span className="truncate font-medium">{entry.action}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {entry.messageId}
            </span>
            <span className="truncate text-muted-foreground">{entry.summary}</span>
          </summary>
          <RuntimeLogJsonBlock value={entry.detail} />
        </details>
      ))}
    </div>
  );
}

function RuntimeLogJsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto border-t border-border/40 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
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
      <Button disabled={disabled} size="sm" type="button" onClick={onPlug}>
        <PlugZapIcon />
        {action.label}
      </Button>
    );
  }

  if (action.kind === "unplug") {
    return (
      <Button
        disabled={disabled}
        size="sm"
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
  const [idTag, setIdTag] = useState("CARD001");

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
        <Button disabled={disabled} size="sm" type="button">
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
        <Button disabled={disabled || transactionId === undefined} size="sm" type="button">
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
