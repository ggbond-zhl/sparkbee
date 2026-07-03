import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChargingPointSummaryResponse,
  ConnectorResponse,
} from "@spark-bee/contracts";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createConnector,
  deleteConnector,
  listConnectors,
  updateConnector,
} from "@/features/charging-points/api/chargingPoints";
import {
  connectorManagementFormDefaultValues,
  connectorManagementFormSchema,
  type ConnectorManagementFormInput,
  type ConnectorManagementFormValues,
} from "@/features/charging-points/model/connectorManagementForm";

interface ChargingPointConnectorManagementDialogProps {
  item: ChargingPointSummaryResponse;
  open: boolean;
  onOpenChange(open: boolean): void;
}

function connectorToFormValues(
  connector: ConnectorResponse,
): ConnectorManagementFormInput {
  return {
    connectorId: String(connector.connectorId),
    type: connector.type,
    format: connector.format,
    powerType: connector.powerType,
    maxVoltage:
      connector.maxVoltage === null ? "" : String(connector.maxVoltage),
    maxCurrent:
      connector.maxCurrent === null ? "" : String(connector.maxCurrent),
    maxPower: connector.maxPower === null ? "" : String(connector.maxPower),
  };
}

function createNextConnectorFormValues(
  connectorIds: number[],
): ConnectorManagementFormInput {
  const nextConnectorId = Math.max(0, ...connectorIds) + 1;

  return {
    ...connectorManagementFormDefaultValues,
    connectorId: String(nextConnectorId),
  };
}

interface DraftConnectorTab {
  key: string;
  values: ConnectorManagementFormInput;
}

export function ChargingPointConnectorManagementDialog({
  item,
  onOpenChange,
  open,
}: ChargingPointConnectorManagementDialogProps) {
  const [activeTab, setActiveTab] = useState("");
  const [draftTabs, setDraftTabs] = useState<DraftConnectorTab[]>([]);
  const [draftSequence, setDraftSequence] = useState(1);
  const queryClient = useQueryClient();
  const connectorsQuery = useQuery({
    queryKey: ["charging-point-connectors", item.id],
    queryFn: () => listConnectors(item.id),
    enabled: open,
  });
  const connectors = connectorsQuery.data ?? [];
  const tabs = useMemo(
    () => [
      ...connectors.map((connector) => ({
        kind: "saved" as const,
        key: connector.id,
        label: `枪口 ${connector.connectorId}`,
        connector,
        values: connectorToFormValues(connector),
      })),
      ...draftTabs.map((draft) => ({
        kind: "draft" as const,
        key: draft.key,
        label: `枪口 ${draft.values.connectorId}`,
        connector: null,
        values: draft.values,
      })),
    ],
    [connectors, draftTabs],
  );

  useEffect(() => {
    if (!open || tabs.length === 0) {
      return;
    }

    const firstTab = tabs[0];
    if (firstTab && !tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(firstTab.key);
    }
  }, [activeTab, open, tabs]);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setActiveTab("");
      setDraftTabs([]);
    }
  }
  function addDraftTab() {
    const connectorIds = [
      ...connectors.map((connector) => connector.connectorId),
      ...draftTabs.map((draft) => Number(draft.values.connectorId)),
    ];
    const draftKey = `draft-${draftSequence}`;
    const draft = {
      key: draftKey,
      values: createNextConnectorFormValues(connectorIds),
    };

    setDraftSequence((value) => value + 1);
    setDraftTabs((current) => [...current, draft]);
    setActiveTab(draftKey);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>枪口管理</DialogTitle>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="min-w-0">
            <div className="truncate font-medium">{item.name}</div>
          </div>
          <Tabs
            value={activeTab}
            className="min-w-0"
            onValueChange={setActiveTab}
          >
            <div className="flex min-w-0 items-center gap-2">
              {tabs.length > 0 && (
                <TabsList className="min-w-0 max-w-full justify-start">
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.key} value={tab.key}>
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              )}
              <Button
                aria-label="新增枪口"
                size="icon"
                type="button"
                variant="outline"
                onClick={addDraftTab}
              >
                <PlusIcon />
              </Button>
            </div>
            {connectorsQuery.isLoading && (
              <div className="text-sm text-muted-foreground">加载中</div>
            )}
            {connectorsQuery.isError && (
              <div role="alert" className="text-sm text-destructive">
                枪口列表加载失败
              </div>
            )}
            {!connectorsQuery.isLoading &&
              !connectorsQuery.isError &&
              tabs.length === 0 && (
                <div className="text-sm text-muted-foreground">暂无枪口</div>
              )}
            {tabs.map((tab) => (
              <TabsContent key={tab.key} value={tab.key}>
                <ConnectorTabForm
                  chargingPointId={item.id}
                  connector={tab.connector}
                  idPrefix={`connector-${tab.key}`}
                  initialValues={tab.values}
                  isLastSavedConnector={connectors.length === 1}
                  tabKey={tab.key}
                  onCreated={(connector) => {
                    setDraftTabs((current) =>
                      current.filter((draft) => draft.key !== tab.key),
                    );
                    setActiveTab(connector.id);
                  }}
                  onDeleted={() => {
                    const tabIndex = tabs.findIndex(
                      (item) => item.key === tab.key,
                    );
                    const remainingTabs = tabs.filter(
                      (item) => item.key !== tab.key,
                    );
                    if (tab.kind === "draft") {
                      setDraftTabs((current) =>
                        current.filter((draft) => draft.key !== tab.key),
                      );
                      toast.success("未保存枪口已移除");
                    }
                    setActiveTab(
                      remainingTabs[
                        Math.min(tabIndex, remainingTabs.length - 1)
                      ]?.key ?? "",
                    );
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ConnectorTabFormProps {
  chargingPointId: string;
  connector: ConnectorResponse | null;
  idPrefix: string;
  initialValues: ConnectorManagementFormInput;
  isLastSavedConnector: boolean;
  tabKey: string;
  onCreated(connector: ConnectorResponse): void;
  onDeleted(): void;
}

function ConnectorTabForm({
  chargingPointId,
  connector,
  idPrefix,
  initialValues,
  isLastSavedConnector,
  onCreated,
  onDeleted,
  tabKey,
}: ConnectorTabFormProps) {
  const [formatSelectOpen, setFormatSelectOpen] = useState(false);
  const [powerTypeSelectOpen, setPowerTypeSelectOpen] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<
    ConnectorManagementFormInput,
    undefined,
    ConnectorManagementFormValues
  >({
    resolver: standardSchemaResolver(connectorManagementFormSchema),
    values: initialValues,
  });
  const saveMutation = useMutation({
    mutationFn: (values: ConnectorManagementFormValues) =>
      connector
        ? updateConnector(chargingPointId, connector.id, values)
        : createConnector(chargingPointId, values),
    onSuccess: async (savedConnector) => {
      queryClient.setQueryData<ConnectorResponse[]>(
        ["charging-point-connectors", chargingPointId],
        (current) => {
          if (!current) {
            return [savedConnector];
          }

          if (connector === null) {
            return [...current, savedConnector];
          }

          return current.map((item) =>
            item.id === savedConnector.id ? savedConnector : item,
          );
        },
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["charging-point-connectors", chargingPointId],
        }),
        queryClient.invalidateQueries({ queryKey: ["charging-points"] }),
      ]);
      form.reset(connectorToFormValues(savedConnector));
      if (connector === null) {
        onCreated(savedConnector);
      }
      toast.success(connector === null ? "枪口已新增" : "枪口已保存");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "枪口保存失败");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => {
      if (connector === null) {
        throw new Error("草稿枪口无需删除");
      }

      return deleteConnector(chargingPointId, connector.id);
    },
    onSuccess: async () => {
      if (connector === null) {
        return;
      }

      queryClient.setQueryData<ConnectorResponse[]>(
        ["charging-point-connectors", chargingPointId],
        (current) =>
          current?.filter((item) => item.id !== connector.id) ?? current,
      );
      onDeleted();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["charging-point-connectors", chargingPointId],
        }),
        queryClient.invalidateQueries({ queryKey: ["charging-points"] }),
      ]);
      toast.success("枪口已删除");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "枪口删除失败");
    },
  });
  const saveError =
    saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const deleteError =
    deleteMutation.error instanceof Error ? deleteMutation.error.message : null;
  const formErrors = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
      <Card>
        <CardContent>
          <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(formErrors.connectorId)}>
              <FieldLabel htmlFor={`${idPrefix}-id`}>枪口编号</FieldLabel>
              <Input
                id={`${idPrefix}-id`}
                aria-invalid={Boolean(formErrors.connectorId)}
                aria-readonly={connector !== null}
                inputMode="numeric"
                readOnly={connector !== null}
                type="number"
                {...form.register("connectorId")}
              />
              <FieldError errors={[formErrors.connectorId]} />
            </Field>
            <Field data-invalid={Boolean(formErrors.type)}>
              <FieldLabel htmlFor={`${idPrefix}-type`}>类型</FieldLabel>
              <Input
                id={`${idPrefix}-type`}
                aria-invalid={Boolean(formErrors.type)}
                placeholder="Type2 / CCS2"
                {...form.register("type")}
              />
              <FieldError errors={[formErrors.type]} />
            </Field>
            <Field data-invalid={Boolean(formErrors.format)}>
              <FieldLabel htmlFor={`${idPrefix}-format`}>形态</FieldLabel>
              <Controller
                control={form.control}
                name="format"
                render={({ field }) => (
                  <Select
                    open={formatSelectOpen}
                    value={field.value}
                    onOpenChange={setFormatSelectOpen}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id={`${idPrefix}-format`}
                      ref={field.ref}
                      aria-invalid={Boolean(formErrors.format)}
                      className="w-full"
                      onBlur={field.onBlur}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="socket">socket</SelectItem>
                        <SelectItem value="cable">cable</SelectItem>
                        <SelectItem value="unknown">unknown</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[formErrors.format]} />
            </Field>
            <Field data-invalid={Boolean(formErrors.powerType)}>
              <FieldLabel htmlFor={`${idPrefix}-power-type`}>供电</FieldLabel>
              <Controller
                control={form.control}
                name="powerType"
                render={({ field }) => (
                  <Select
                    open={powerTypeSelectOpen}
                    value={field.value}
                    onOpenChange={setPowerTypeSelectOpen}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id={`${idPrefix}-power-type`}
                      ref={field.ref}
                      aria-invalid={Boolean(formErrors.powerType)}
                      className="w-full"
                      onBlur={field.onBlur}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="ac">ac</SelectItem>
                        <SelectItem value="dc">dc</SelectItem>
                        <SelectItem value="unknown">unknown</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[formErrors.powerType]} />
            </Field>
            <Field data-invalid={Boolean(formErrors.maxVoltage)}>
              <FieldLabel htmlFor={`${idPrefix}-max-voltage`}>
                电压 V
              </FieldLabel>
              <Input
                id={`${idPrefix}-max-voltage`}
                aria-invalid={Boolean(formErrors.maxVoltage)}
                inputMode="numeric"
                placeholder="可选"
                type="number"
                {...form.register("maxVoltage")}
              />
              <FieldError errors={[formErrors.maxVoltage]} />
            </Field>
            <Field data-invalid={Boolean(formErrors.maxCurrent)}>
              <FieldLabel htmlFor={`${idPrefix}-max-current`}>
                电流 A
              </FieldLabel>
              <Input
                id={`${idPrefix}-max-current`}
                aria-invalid={Boolean(formErrors.maxCurrent)}
                inputMode="numeric"
                placeholder="可选"
                type="number"
                {...form.register("maxCurrent")}
              />
              <FieldError errors={[formErrors.maxCurrent]} />
            </Field>
            <Field data-invalid={Boolean(formErrors.maxPower)}>
              <FieldLabel htmlFor={`${idPrefix}-max-power`}>功率 W</FieldLabel>
              <Input
                id={`${idPrefix}-max-power`}
                aria-invalid={Boolean(formErrors.maxPower)}
                inputMode="numeric"
                placeholder="可选"
                type="number"
                {...form.register("maxPower")}
              />
              <FieldError errors={[formErrors.maxPower]} />
            </Field>
          </FieldGroup>
          {saveError && (
            <div role="alert" className="mt-4 text-sm text-destructive">
              {saveError}
            </div>
          )}
          {deleteError && (
            <div role="alert" className="mt-4 text-sm text-destructive">
              {deleteError}
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <div>
            {connector === null ? (
              <Button
                disabled={saveMutation.isPending}
                type="button"
                variant="destructive"
                onClick={onDeleted}
              >
                <Trash2Icon data-icon="inline-start" />
                删除
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={
                      deleteMutation.isPending || saveMutation.isPending
                    }
                    type="button"
                    variant="destructive"
                  >
                    <Trash2Icon data-icon="inline-start" />
                    删除
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除枪口</AlertDialogTitle>
                    <AlertDialogDescription>
                      删除后，该枪口将不再出现在当前桩实例中。已有运行记录不会被删除。
                      {isLastSavedConnector
                        ? " 删除最后一个枪口后，该桩实例在新增枪口前不能启动。"
                        : null}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      disabled={deleteMutation.isPending}
                      type="button"
                    >
                      取消
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleteMutation.isPending}
                      type="button"
                      variant="destructive"
                      onClick={() => deleteMutation.mutate()}
                    >
                      {deleteMutation.isPending ? "删除中" : "删除"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button
                disabled={saveMutation.isPending || deleteMutation.isPending}
                type="button"
                variant="outline"
              >
                取消
              </Button>
            </DialogClose>
            <Button
              disabled={saveMutation.isPending || deleteMutation.isPending}
              type="submit"
            >
              <SaveIcon data-icon="inline-start" />
              {saveMutation.isPending ? "保存中" : "保存"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
