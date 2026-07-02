import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ColumnDef,
  OnChangeFn,
  RowSelectionState,
} from "@tanstack/react-table";
import {
  PAGE_SIZE_OPTIONS,
  type ListChargingPointsResponse,
  type PageSize,
} from "@spark-bee/contracts";
import {
  ChevronDownIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Controller, type UseFormRegisterReturn } from "react-hook-form";
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
import { DataTable } from "@/components/data-table/DataTable";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function TruncatedText({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{value}</span>
      </TooltipTrigger>
      <TooltipContent className="break-all">{value}</TooltipContent>
    </Tooltip>
  );
}

export function ChargingPointListPage() {
  const queryClient = useQueryClient();
  const keyword = useChargingPointListStore((state) => state.keyword);
  const page = useChargingPointListStore((state) => state.page);
  const pageSize = useChargingPointListStore((state) => state.pageSize);
  const setKeyword = useChargingPointListStore((state) => state.setKeyword);
  const setPage = useChargingPointListStore((state) => state.setPage);
  const setPageSize = useChargingPointListStore((state) => state.setPageSize);
  const selectedId = useChargingPointListStore((state) => state.selectedId);
  const selectedIds = useChargingPointListStore((state) => state.selectedIds);
  const selectChargingPoint = useChargingPointListStore(
    (state) => state.selectChargingPoint,
  );
  const setSelectedIds = useChargingPointListStore(
    (state) => state.setSelectedIds,
  );
  const form = useForm<ChargingPointListSearchFormValues>({
    resolver: standardSchemaResolver(chargingPointListSearchFormSchema),
    values: { keyword },
  });
  const chargingPointsQuery = useQuery(
    chargingPointListQueryOptions({ keyword, page, pageSize }),
  );
  const items = chargingPointsQuery.data?.items ?? [];
  const total = chargingPointsQuery.data?.total ?? 0;

  function handlePageSizeChange(nextPageSize: PageSize) {
    setPageSize(nextPageSize);
  }

  async function handleListSearch(values: ChargingPointListSearchFormValues) {
    setKeyword(values.keyword);
    await queryClient.invalidateQueries({ queryKey: ["charging-points"] });
  }

  return (
    <section className="flex flex-col gap-5">
      <form
        className="md:hidden"
        onSubmit={form.handleSubmit(handleListSearch)}
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
          <Button type="submit">
            <SearchIcon data-icon="inline-start" />
            搜索
          </Button>
        </FieldGroup>
      </form>

      <ChargingPointMobileCardList
        isError={chargingPointsQuery.isError}
        isLoading={chargingPointsQuery.isLoading}
        items={items}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSelect={selectChargingPoint}
        page={page}
        pageSize={pageSize}
        selectedId={selectedId}
        total={total}
      />
      <ChargingPointTable
        isError={chargingPointsQuery.isError}
        isLoading={chargingPointsQuery.isLoading}
        items={items}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        onSearch={form.handleSubmit(handleListSearch)}
        onSelect={selectChargingPoint}
        onSelectedIdsChange={setSelectedIds}
        page={page}
        pageSize={pageSize}
        searchInput={form.register("keyword")}
        selectedIds={selectedIds}
        selectedId={selectedId}
        total={total}
      />
    </section>
  );
}

interface ChargingPointListViewProps {
  isError: boolean;
  isLoading: boolean;
  items: ChargingPointListItem[];
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: PageSize): void;
  onSelect(id: string): void;
  page: number;
  pageSize: PageSize;
  selectedId: string | null;
  total: number;
}

interface ChargingPointTableProps extends ChargingPointListViewProps {
  onSelectedIdsChange(ids: string[]): void;
  onSearch(): void;
  searchInput: UseFormRegisterReturn<"keyword">;
  selectedIds: string[];
}

function ChargingPointMobileCardList({
  isError,
  isLoading,
  items,
  onPageChange,
  onPageSizeChange,
  onSelect,
  page,
  pageSize,
  selectedId,
  total,
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
                <dd className="truncate font-mono text-xs">
                  <TruncatedText className="block truncate" value={item.identity} />
                </dd>
                <dt className="text-muted-foreground">CSMS</dt>
                <dd className="truncate">
                  <TruncatedText
                    className="block truncate"
                    value={item.centralSystemUrl}
                  />
                </dd>
                <dt className="text-muted-foreground">型号</dt>
                <dd className="truncate">
                  <TruncatedText
                    className="block truncate"
                    value={`${item.vendor} / ${item.model}`}
                  />
                </dd>
              </dl>
            </CardContent>
          </Card>
        </button>
      ))}
      <MobilePagination
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}

function ChargingPointTable({
  isError,
  isLoading,
  items,
  onPageChange,
  onPageSizeChange,
  onSelectedIdsChange,
  onSearch,
  onSelect,
  page,
  pageSize,
  searchInput,
  selectedIds,
  selectedId,
  total,
}: ChargingPointTableProps) {
  const columns = useMemo<ColumnDef<ChargingPointListItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label="全选当前列表"
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            disabled={table.getRowModel().rows.length === 0}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`选择 ${row.original.name}`}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        enableHiding: false,
        enableSorting: false,
      },
      {
        accessorKey: "name",
        header: "名称",
        cell: ({ row }) => (
          <button
            type="button"
            className="flex max-w-56 appearance-none flex-col gap-0.5 rounded-md border-0 bg-transparent p-0 text-left text-inherit outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => onSelect(row.original.id)}
          >
            <TruncatedText
              className="block max-w-full truncate font-medium"
              value={row.original.name}
            />
            {row.original.description && (
              <TruncatedText
                className="block max-w-full truncate text-muted-foreground"
                value={row.original.description}
              />
            )}
          </button>
        ),
      },
      {
        accessorKey: "identity",
        header: "桩身份",
        cell: ({ row }) => (
          <span className="font-mono">{row.original.identity}</span>
        ),
      },
      {
        accessorKey: "centralSystemUrl",
        header: "CSMS",
        cell: ({ row }) => (
          <TruncatedText
            className="block w-full truncate"
            value={row.original.centralSystemUrl}
          />
        ),
      },
      {
        id: "model",
        header: "型号",
        cell: ({ row }) => (
          <TruncatedText
            className="block max-w-48 truncate"
            value={`${row.original.vendor} / ${row.original.model}`}
          />
        ),
      },
      {
        accessorKey: "connectorCount",
        header: () => <div className="text-right">枪口</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.connectorCount}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">操作</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <ChargingPointRowActionMenu item={row.original} />
          </div>
        ),
        enableHiding: false,
        enableSorting: false,
      },
    ],
    [onSelect],
  );
  const rowSelection = useMemo<RowSelectionState>(
    () =>
      Object.fromEntries(
        selectedIds.map((id) => [id, true] as const),
      ),
    [selectedIds],
  );
  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = (updater) => {
    const nextSelection =
      typeof updater === "function" ? updater(rowSelection) : updater;
    onSelectedIdsChange(
      Object.entries(nextSelection)
        .filter(([, selected]) => selected)
        .map(([id]) => id),
    );
  };
  const tableItems = isLoading || isError ? [] : items;
  const emptyText = isLoading
    ? "加载中"
    : isError
      ? "列表加载失败"
      : "暂无桩实例";

  return (
    <div className="hidden flex-col gap-3 md:flex">
      <form
        className="flex items-center justify-between gap-2"
        onSubmit={onSearch}
      >
        <div className="flex items-center gap-2">
          <Input
            aria-label="搜索充电桩"
            className="max-w-sm"
            placeholder="搜索名称、桩身份、厂商或型号"
            {...searchInput}
          />
          <Button type="submit">
            <SearchIcon data-icon="inline-start" />
            搜索
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <ChargingPointCreateDialog />
        </div>
      </form>

      <DataTable
        columns={columns}
        data={tableItems}
        emptyClassName={isError ? "text-destructive" : undefined}
        emptyText={emptyText}
        getRowId={(item) => item.id}
        getRowState={(row) =>
          row.original.id === selectedId ? "selected" : undefined
        }
        onPageChange={onPageChange}
        onPageSizeChange={(nextPageSize) =>
          onPageSizeChange(nextPageSize as PageSize)
        }
        onRowSelectionChange={handleRowSelectionChange}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        rowSelection={rowSelection}
        tableClassName="min-w-[840px]"
        total={total}
      />
    </div>
  );
}

function MobilePagination({
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  total,
}: {
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: PageSize): void;
  page: number;
  pageSize: PageSize;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="text-muted-foreground tabular-nums">
        第 {page} / {totalPages} 页，共 {total} 条
      </div>
      <div className="flex items-center gap-2">
        <PageSizeMenu pageSize={pageSize} onPageSizeChange={onPageSizeChange} />
        <Button
          disabled={page <= 1}
          type="button"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <Button
          disabled={page >= totalPages}
          type="button"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function PageSizeMenu({
  onPageSizeChange,
  pageSize,
}: {
  onPageSizeChange(pageSize: PageSize): void;
  pageSize: PageSize;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          每页 {pageSize}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-28">
        <DropdownMenuLabel>每页数量</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option} value={String(option)}>
              {option}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChargingPointRowActionMenu({ item }: { item: ChargingPointListItem }) {
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
          <DropdownMenuLabel>操作</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={deleteMutation.isPending}
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
  const [protocolSelectOpen, setProtocolSelectOpen] = useState(false);
  const ignoreNextDialogOutsideInteractionRef = useRef(false);
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
      ignoreNextDialogOutsideInteractionRef.current = false;
      form.reset(chargingPointCreateFormDefaultValues);
      createMutation.reset();
    }
  }

  function handleProtocolSelectOpenChange(nextOpen: boolean) {
    setProtocolSelectOpen(nextOpen);
    if (nextOpen) {
      ignoreNextDialogOutsideInteractionRef.current = true;
    }
  }

  function preventDialogCloseAfterProtocolSelectInteraction(event: {
    preventDefault(): void;
  }) {
    if (!ignoreNextDialogOutsideInteractionRef.current) {
      return;
    }

    event.preventDefault();
    window.setTimeout(() => {
      ignoreNextDialogOutsideInteractionRef.current = false;
    }, 0);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon data-icon="inline-start" />
          新增
        </Button>
      </DialogTrigger>
      <DialogContent
        onFocusOutside={preventDialogCloseAfterProtocolSelectInteraction}
        onInteractOutside={preventDialogCloseAfterProtocolSelectInteraction}
        onPointerDownOutside={preventDialogCloseAfterProtocolSelectInteraction}
      >
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
            <Field data-invalid={Boolean(fieldErrors.protocol)}>
              <FieldLabel htmlFor="charging-point-create-protocol">
                协议版本
              </FieldLabel>
              <Controller
                control={form.control}
                name="protocol"
                render={({ field }) => (
                  <Select
                    open={protocolSelectOpen}
                    value={field.value}
                    onOpenChange={handleProtocolSelectOpenChange}
                    onValueChange={(value) => {
                      ignoreNextDialogOutsideInteractionRef.current = false;
                      field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="charging-point-create-protocol"
                      ref={field.ref}
                      aria-invalid={Boolean(fieldErrors.protocol)}
                      className="w-full"
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder="选择协议版本" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="OCPP16J">OCPP 1.6J</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[fieldErrors.protocol]} />
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
