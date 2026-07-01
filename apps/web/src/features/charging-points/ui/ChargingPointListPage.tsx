import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListChargingPointsResponse } from "@spark-bee/contracts";
import {
  ListFilterIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  createChargingPoint,
  deleteChargingPoint,
} from "@/features/charging-points/api/chargingPoints";
import {
  chargingPointCreateFormDefaultValues,
  chargingPointCreateFormSchema,
  type ChargingPointCreateFormInput,
  type ChargingPointCreateFormValues,
} from "@/features/charging-points/model/chargingPointCreateForm";
import {
  chargingPointListSearchFormSchema,
  type ChargingPointListSearchFormValues,
} from "@/features/charging-points/model/chargingPointListForm";
import { chargingPointListQueryOptions } from "@/features/charging-points/model/chargingPointQueries";
import { useChargingPointListStore } from "@/features/charging-points/model/chargingPointListStore";

type ChargingPointListItem = ListChargingPointsResponse["items"][number];

export function ChargingPointListPage() {
  const keyword = useChargingPointListStore((state) => state.keyword);
  const setKeyword = useChargingPointListStore((state) => state.setKeyword);
  const selectedId = useChargingPointListStore((state) => state.selectedId);
  const selectedIds = useChargingPointListStore((state) => state.selectedIds);
  const selectChargingPoint = useChargingPointListStore(
    (state) => state.selectChargingPoint,
  );
  const toggleSelectedId = useChargingPointListStore(
    (state) => state.toggleSelectedId,
  );
  const toggleAllVisible = useChargingPointListStore(
    (state) => state.toggleAllVisible,
  );
  const form = useForm<ChargingPointListSearchFormValues>({
    resolver: standardSchemaResolver(chargingPointListSearchFormSchema),
    values: { keyword },
  });
  const chargingPointsQuery = useQuery(chargingPointListQueryOptions({ keyword }));
  const items = chargingPointsQuery.data?.items ?? [];

  return (
    <section className="flex flex-col gap-5">
      <form
        className="md:hidden"
        onSubmit={form.handleSubmit((values) => setKeyword(values.keyword))}
      >
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.keyword)}>
            <FieldLabel className="sr-only" htmlFor="charging-point-keyword">
              关键词
            </FieldLabel>
            <Input
              id="charging-point-keyword"
              aria-invalid={Boolean(form.formState.errors.keyword)}
              placeholder="名称、桩身份、厂商或型号"
              {...form.register("keyword")}
            />
            <FieldError errors={[form.formState.errors.keyword]} />
          </Field>
          <Button type="submit">搜索</Button>
        </FieldGroup>
      </form>

      <ChargingPointMobileCardList
        isError={chargingPointsQuery.isError}
        isLoading={chargingPointsQuery.isLoading}
        items={items}
        onSelect={selectChargingPoint}
        selectedId={selectedId}
      />
      <ChargingPointTable
        isError={chargingPointsQuery.isError}
        isLoading={chargingPointsQuery.isLoading}
        items={items}
        onSearch={form.handleSubmit((values) => setKeyword(values.keyword))}
        onSelect={selectChargingPoint}
        onToggleAllVisible={() => toggleAllVisible(items.map((item) => item.id))}
        onToggleSelected={toggleSelectedId}
        searchInput={form.register("keyword")}
        selectedIds={selectedIds}
        selectedId={selectedId}
      />
    </section>
  );
}

interface ChargingPointListViewProps {
  isError: boolean;
  isLoading: boolean;
  items: ChargingPointListItem[];
  onSelect(id: string): void;
  selectedId: string | null;
}

interface ChargingPointTableProps extends ChargingPointListViewProps {
  onSearch(): void;
  onToggleAllVisible(): void;
  onToggleSelected(id: string): void;
  searchInput: UseFormRegisterReturn<"keyword">;
  selectedIds: string[];
}

function ChargingPointMobileCardList({
  isError,
  isLoading,
  items,
  onSelect,
  selectedId,
}: ChargingPointListViewProps) {
  if (isLoading) {
    return <ListState className="md:hidden" text="加载中" />;
  }

  if (isError) {
    return <ListState className="text-destructive md:hidden" text="列表加载失败" />;
  }

  if (items.length === 0) {
    return <ListState className="md:hidden" text="暂无桩实例" />;
  }

  return (
    <div className="flex flex-col gap-3 md:hidden">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="appearance-none border-0 bg-transparent p-0 text-left text-inherit outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => onSelect(item.id)}
        >
          <Card
            data-state={item.id === selectedId ? "selected" : undefined}
          >
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
              {item.description && (
                <CardDescription>{item.description}</CardDescription>
              )}
              <CardAction className="text-sm tabular-nums text-muted-foreground">
                {item.connectorCount} 枪
              </CardAction>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">桩身份</dt>
                <dd className="truncate font-mono text-xs">{item.identity}</dd>
                <dt className="text-muted-foreground">CSMS</dt>
                <dd className="truncate">{item.centralSystemUrl}</dd>
                <dt className="text-muted-foreground">型号</dt>
                <dd className="truncate">
                  {item.vendor} / {item.model}
                </dd>
              </dl>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}

function ChargingPointTable({
  isError,
  isLoading,
  items,
  onSearch,
  onSelect,
  onToggleAllVisible,
  onToggleSelected,
  searchInput,
  selectedIds,
  selectedId,
}: ChargingPointTableProps) {
  const visibleIds = items.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));

  return (
    <div className="hidden flex-col gap-3 md:flex">
      <form className="flex items-center gap-2" onSubmit={onSearch}>
        <Button type="button" variant="outline" size="icon">
          <ListFilterIcon />
          <span className="sr-only">筛选</span>
        </Button>
        <Input
          aria-label="搜索充电桩"
          className="flex-1"
          placeholder="搜索名称、桩身份、厂商或型号"
          {...searchInput}
        />
        <Button type="submit">
          搜索
        </Button>
        <ChargingPointCreateDialog />
      </form>

      <Table className="min-w-[840px]">
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                aria-label="全选当前列表"
                checked={
                  allVisibleSelected
                    ? true
                    : someVisibleSelected
                      ? "indeterminate"
                      : false
                }
                disabled={visibleIds.length === 0}
                onCheckedChange={onToggleAllVisible}
              />
            </TableHead>
            <TableHead>名称</TableHead>
            <TableHead>桩身份</TableHead>
            <TableHead>CSMS</TableHead>
            <TableHead>型号</TableHead>
            <TableHead className="text-right">枪口</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={7}>
                加载中
              </TableCell>
            </TableRow>
          )}
          {isError && (
            <TableRow>
              <TableCell className="text-destructive" colSpan={7}>
                列表加载失败
              </TableCell>
            </TableRow>
          )}
          {!isLoading && !isError && items.length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={7}>
                暂无桩实例
              </TableCell>
            </TableRow>
          )}
          {items.map((item) => (
            <TableRow
              key={item.id}
              data-state={item.id === selectedId ? "selected" : undefined}
            >
              <TableCell>
                <Checkbox
                  aria-label={`选择 ${item.name}`}
                  checked={selectedIds.includes(item.id)}
                  onCheckedChange={() => onToggleSelected(item.id)}
                />
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className="flex max-w-56 appearance-none flex-col gap-0.5 rounded-md border-0 bg-transparent p-0 text-left text-inherit outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => onSelect(item.id)}
                >
                  <span className="truncate font-medium">{item.name}</span>
                  {item.description && (
                    <span className="truncate text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </button>
              </TableCell>
              <TableCell className="font-mono">{item.identity}</TableCell>
              <TableCell>
                <span className="block max-w-72 truncate">
                  {item.centralSystemUrl}
                </span>
              </TableCell>
              <TableCell>
                {item.vendor} / {item.model}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {item.connectorCount}
              </TableCell>
              <TableCell className="text-right">
                <ChargingPointRowActions item={item} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ChargingPointRowActions({ item }: { item: ChargingPointListItem }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();
  const removeDeletedId = useChargingPointListStore(
    (state) => state.removeDeletedId,
  );
  const deleteMutation = useMutation({
    mutationFn: () => deleteChargingPoint(item.id),
    onSuccess: async () => {
      removeDeletedId(item.id);
      await queryClient.invalidateQueries({ queryKey: ["charging-points"] });
      setConfirmOpen(false);
    },
  });
  const deleteError =
    deleteMutation.error instanceof Error ? deleteMutation.error.message : null;

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`打开 ${item.name} 操作菜单`}
            size="icon"
            type="button"
            variant="ghost"
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-32">
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => {
                event.preventDefault();
                deleteMutation.reset();
                setConfirmOpen(true);
              }}
            >
              <Trash2Icon />
              删除
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            删除后，{item.name} 及其枪口将不再出现在列表中。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && (
          <div role="alert" className="text-sm text-destructive">
            {deleteError}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={deleteMutation.isPending}
            type="button"
            variant="outline"
          >
            取消
          </AlertDialogCancel>
          <Button
            disabled={deleteMutation.isPending}
            type="button"
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? "删除中" : "删除"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ChargingPointCreateDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<
    ChargingPointCreateFormInput,
    undefined,
    ChargingPointCreateFormValues
  >({
    resolver: standardSchemaResolver(chargingPointCreateFormSchema),
    defaultValues: chargingPointCreateFormDefaultValues,
  });
  const createMutation = useMutation({
    mutationFn: createChargingPoint,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["charging-points"] });
      form.reset(chargingPointCreateFormDefaultValues);
      setOpen(false);
    },
  });
  const fieldErrors = form.formState.errors;
  const createError =
    createMutation.error instanceof Error ? createMutation.error.message : null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      form.reset(chargingPointCreateFormDefaultValues);
      createMutation.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon data-icon="inline-start" />
          新增
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        >
          <DialogHeader>
            <DialogTitle>新增充电桩</DialogTitle>
          </DialogHeader>
          <FieldGroup className="md:grid md:grid-cols-2">
            <Field
              className="md:col-span-2"
              data-invalid={Boolean(fieldErrors.name)}
            >
              <FieldLabel htmlFor="charging-point-create-name">名称</FieldLabel>
              <Input
                id="charging-point-create-name"
                aria-invalid={Boolean(fieldErrors.name)}
                placeholder="例如 1 号测试桩"
                {...form.register("name")}
              />
              <FieldError errors={[fieldErrors.name]} />
            </Field>
            <Field
              className="md:col-span-2"
              data-invalid={Boolean(fieldErrors.identity)}
            >
              <FieldLabel htmlFor="charging-point-create-identity">
                桩身份
              </FieldLabel>
              <Input
                id="charging-point-create-identity"
                aria-invalid={Boolean(fieldErrors.identity)}
                placeholder="例如 CP_001"
                {...form.register("identity")}
              />
              <FieldError errors={[fieldErrors.identity]} />
            </Field>
            <Field
              className="md:col-span-2"
              data-invalid={Boolean(fieldErrors.centralSystemUrl)}
            >
              <FieldLabel htmlFor="charging-point-create-csms">
                CSMS 地址
              </FieldLabel>
              <Input
                id="charging-point-create-csms"
                aria-invalid={Boolean(fieldErrors.centralSystemUrl)}
                placeholder="ws://localhost:9000/ocpp"
                {...form.register("centralSystemUrl")}
              />
              <FieldDescription>
                填写基础 WebSocket 地址，不包含最终桩身份路径。
              </FieldDescription>
              <FieldError errors={[fieldErrors.centralSystemUrl]} />
            </Field>
            <Field data-invalid={Boolean(fieldErrors.vendor)}>
              <FieldLabel htmlFor="charging-point-create-vendor">厂商</FieldLabel>
              <Input
                id="charging-point-create-vendor"
                aria-invalid={Boolean(fieldErrors.vendor)}
                placeholder="例如 SparkBee"
                {...form.register("vendor")}
              />
              <FieldError errors={[fieldErrors.vendor]} />
            </Field>
            <Field data-invalid={Boolean(fieldErrors.model)}>
              <FieldLabel htmlFor="charging-point-create-model">型号</FieldLabel>
              <Input
                id="charging-point-create-model"
                aria-invalid={Boolean(fieldErrors.model)}
                placeholder="例如 Simulator"
                {...form.register("model")}
              />
              <FieldError errors={[fieldErrors.model]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="charging-point-create-firmware">
                固件版本
              </FieldLabel>
              <Input
                id="charging-point-create-firmware"
                placeholder="可选"
                {...form.register("firmwareVersion")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="charging-point-create-serial">
                序列号
              </FieldLabel>
              <Input
                id="charging-point-create-serial"
                placeholder="可选"
                {...form.register("serialNumber")}
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="charging-point-create-description">
                说明
              </FieldLabel>
              <Textarea
                id="charging-point-create-description"
                placeholder="可选"
                {...form.register("description")}
              />
            </Field>
            <input type="hidden" {...form.register("protocol")} />
          </FieldGroup>
          {createError && (
            <div role="alert" className="text-sm text-destructive">
              {createError}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                disabled={createMutation.isPending}
                type="button"
                variant="outline"
              >
                取消
              </Button>
            </DialogClose>
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "创建中" : "确认"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ListState({ className, text }: { className: string; text: string }) {
  return (
    <Card className={className}>
      <CardContent>{text}</CardContent>
    </Card>
  );
}
