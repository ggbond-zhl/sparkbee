import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  PAGE_SIZE_OPTIONS,
  type ListChargingPointsResponse,
  type PageSize,
} from "@spark-bee/contracts";
import {
  CableIcon,
  ChevronDownIcon,
  PencilIcon,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteChargingPoint } from "@/features/charging-points/api/chargingPoints";
import {
  chargingPointListSearchFormSchema,
  type ChargingPointListSearchFormValues,
} from "@/features/charging-points/model/chargingPointListForm";
import {
  chargingPointInfiniteListQueryOptions,
  chargingPointListQueryOptions,
} from "@/features/charging-points/model/chargingPointQueries";
import { useChargingPointListStore } from "@/features/charging-points/model/chargingPointListStore";
import { ChargingPointCreateDialog } from "@/features/charging-points/ui/ChargingPointCreateDialog";
import { ChargingPointConnectorManagementDialog } from "@/features/charging-points/ui/ChargingPointConnectorManagementDialog";
import { ChargingPointEditDialog } from "@/features/charging-points/ui/ChargingPointEditDialog";
import { useIsMobile } from "@/hooks/use-mobile";

type ChargingPointListItem = ListChargingPointsResponse["items"][number];

export function ChargingPointListPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const keyword = useChargingPointListStore((state) => state.keyword);
  const page = useChargingPointListStore((state) => state.page);
  const pageSize = useChargingPointListStore((state) => state.pageSize);
  const setKeyword = useChargingPointListStore((state) => state.setKeyword);
  const setPage = useChargingPointListStore((state) => state.setPage);
  const setPageSize = useChargingPointListStore((state) => state.setPageSize);
  const form = useForm<ChargingPointListSearchFormValues>({
    resolver: standardSchemaResolver(chargingPointListSearchFormSchema),
    values: { keyword },
  });
  const chargingPointsQuery = useQuery({
    ...chargingPointListQueryOptions({ keyword, page, pageSize }),
    enabled: !isMobile,
  });
  const chargingPointsInfiniteQuery = useInfiniteQuery({
    ...chargingPointInfiniteListQueryOptions({ keyword, pageSize }),
    enabled: isMobile,
  });
  const desktopItems = chargingPointsQuery.data?.items ?? [];
  const mobileItems =
    chargingPointsInfiniteQuery.data?.pages.flatMap((result) => result.items) ??
    [];
  const items = isMobile ? mobileItems : desktopItems;
  const total = isMobile
    ? (chargingPointsInfiniteQuery.data?.pages[0]?.total ?? 0)
    : (chargingPointsQuery.data?.total ?? 0);
  const isLoading = isMobile
    ? chargingPointsInfiniteQuery.isLoading
    : chargingPointsQuery.isLoading;
  const isError = isMobile
    ? chargingPointsInfiniteQuery.isError && mobileItems.length === 0
    : chargingPointsQuery.isError;

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
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        onSubmit={form.handleSubmit(handleListSearch)}
      >
        <FieldGroup className="min-w-0 flex-row gap-2">
          <Field
            className="min-w-0 md:max-w-md"
            data-invalid={Boolean(form.formState.errors.keyword)}
          >
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
          <div className="md:ml-auto">
            <ChargingPointCreateDialog />
          </div>
        </FieldGroup>
      </form>

      <ChargingPointCardList
        hasNextPage={chargingPointsInfiniteQuery.hasNextPage}
        isError={isError}
        isFetchingNextPage={chargingPointsInfiniteQuery.isFetchingNextPage}
        isLoadMoreError={chargingPointsInfiniteQuery.isFetchNextPageError}
        isLoading={isLoading}
        isMobile={isMobile}
        items={items}
        onLoadMore={chargingPointsInfiniteQuery.fetchNextPage}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </section>
  );
}

interface ChargingPointListViewProps {
  hasNextPage: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isLoadMoreError: boolean;
  isLoading: boolean;
  isMobile: boolean;
  items: ChargingPointListItem[];
  onLoadMore(): Promise<unknown>;
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: PageSize): void;
  page: number;
  pageSize: PageSize;
  total: number;
}

function ChargingPointCardList({
  hasNextPage,
  isError,
  isFetchingNextPage,
  isLoadMoreError,
  isLoading,
  isMobile,
  items,
  onLoadMore,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  total,
}: ChargingPointListViewProps) {
  if (isLoading) {
    return <ListState text="加载中" />;
  }

  if (isError) {
    return <ListState className="text-destructive" text="列表加载失败" />;
  }

  if (items.length === 0) {
    return <ListState text="暂无桩实例" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Card key={item.id} className="h-full">
            <Link
              className="flex flex-1 flex-col gap-(--card-spacing) rounded-t-xl text-inherit outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
              params={{ chargingPointId: item.id }}
              to="/charging-points/$chargingPointId"
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
                  <dd className="truncate">
                    <span className="block truncate">{item.identity}</span>
                  </dd>
                  <dt className="text-muted-foreground">CSMS</dt>
                  <dd className="truncate">
                    <span className="block truncate">
                      {item.centralSystemUrl}
                    </span>
                  </dd>
                  <dt className="text-muted-foreground">型号</dt>
                  <dd className="truncate">
                    <span className="block truncate">
                      {item.vendor} / {item.model}
                    </span>
                  </dd>
                </dl>
              </CardContent>
            </Link>
            <CardFooter className="mt-auto flex-wrap justify-end gap-1">
              <ChargingPointCardActions item={item} />
            </CardFooter>
          </Card>
        ))}
      </div>
      {isMobile ? (
        <MobileInfiniteListStatus
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoadMoreError={isLoadMoreError}
          onLoadMore={onLoadMore}
          total={total}
        />
      ) : (
        <ListPagination
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          page={page}
          pageSize={pageSize}
          total={total}
        />
      )}
    </div>
  );
}

function MobileInfiniteListStatus({
  hasNextPage,
  isFetchingNextPage,
  isLoadMoreError,
  onLoadMore,
  total,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoadMoreError: boolean;
  onLoadMore(): Promise<unknown>;
  total: number;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (
      !sentinel ||
      !hasNextPage ||
      isFetchingNextPage ||
      isLoadMoreError ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void onLoadMore();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isLoadMoreError, onLoadMore]);

  if (isLoadMoreError) {
    return (
      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          onClick={() => void onLoadMore()}
        >
          重试加载
        </Button>
      </div>
    );
  }

  if (isFetchingNextPage) {
    return (
      <div className="text-center text-sm text-muted-foreground" role="status">
        正在加载更多…
      </div>
    );
  }

  if (hasNextPage) {
    return <div ref={sentinelRef} className="h-px" aria-hidden="true" />;
  }

  return (
    <div className="text-center text-sm text-muted-foreground">
      已加载全部 {total} 台充电桩
    </div>
  );
}

function ListPagination({
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
    <div className="hidden flex-wrap items-center justify-between gap-2 text-sm md:flex">
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

function ChargingPointCardActions({ item }: { item: ChargingPointListItem }) {
  const [editOpen, setEditOpen] = useState(false);
  const [connectorManagementOpen, setConnectorManagementOpen] = useState(false);
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
      toast.success("充电桩已删除");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "充电桩删除失败");
    },
  });
  const deleteError =
    deleteMutation.error instanceof Error ? deleteMutation.error.message : null;

  return (
    <>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
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
      <Button asChild size="sm" variant="ghost">
        <Link
          to="/charging-points/$chargingPointId/configuration"
          params={{ chargingPointId: item.id }}
        >
          <Settings2Icon data-icon="inline-start" />
          协议配置
        </Link>
      </Button>
      <Button
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => setEditOpen(true)}
      >
        <PencilIcon data-icon="inline-start" />
        编辑
      </Button>
      <Button
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => setConnectorManagementOpen(true)}
      >
        <CableIcon data-icon="inline-start" />
        枪口管理
      </Button>
      <Button
        disabled={deleteMutation.isPending}
        size="sm"
        type="button"
        variant="destructive"
        onClick={() => {
          deleteMutation.reset();
          setConfirmOpen(true);
        }}
      >
        <Trash2Icon data-icon="inline-start" />
        删除
      </Button>
      <ChargingPointEditDialog
        item={item}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ChargingPointConnectorManagementDialog
        item={item}
        open={connectorManagementOpen}
        onOpenChange={setConnectorManagementOpen}
      />
    </>
  );
}

function ListState({ className, text }: { className?: string; text: string }) {
  return (
    <Card className={className}>
      <CardContent>{text}</CardContent>
    </Card>
  );
}
