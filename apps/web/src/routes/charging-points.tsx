import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQuery } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";

import { listChargingPoints } from "@/api/chargingPoints";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useChargingPointListStore } from "@/stores/chargingPointListStore";

const searchFormSchema = z.object({
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符"),
});

type SearchFormValues = z.infer<typeof searchFormSchema>;

export function ChargingPointsRoute() {
  const keyword = useChargingPointListStore((state) => state.keyword);
  const setKeyword = useChargingPointListStore((state) => state.setKeyword);
  const selectedId = useChargingPointListStore((state) => state.selectedId);
  const selectChargingPoint = useChargingPointListStore(
    (state) => state.selectChargingPoint,
  );
  const form = useForm<SearchFormValues>({
    resolver: standardSchemaResolver(searchFormSchema),
    values: { keyword },
  });
  const chargingPointsQuery = useQuery({
    queryKey: ["charging-points", keyword],
    queryFn: () => listChargingPoints({ keyword }),
  });
  const items = chargingPointsQuery.data?.items ?? [];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-normal">桩实例</h1>
          <p className="text-sm text-muted-foreground">
            {chargingPointsQuery.data === undefined
              ? "正在读取列表"
              : `共 ${chargingPointsQuery.data.total} 个桩实例`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void chargingPointsQuery.refetch()}
          disabled={chargingPointsQuery.isFetching}
        >
          <RefreshCwIcon data-icon="inline-start" />
          刷新
        </Button>
      </div>

      <form
        className="rounded-lg border border-border bg-card p-4 text-card-foreground"
        onSubmit={form.handleSubmit((values) => setKeyword(values.keyword))}
      >
        <FieldGroup className="gap-3 md:flex-row md:items-end">
          <Field data-invalid={Boolean(form.formState.errors.keyword)}>
            <FieldLabel htmlFor="charging-point-keyword">关键词</FieldLabel>
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

      <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="h-10 px-3 text-left font-medium">名称</th>
                <th className="h-10 px-3 text-left font-medium">桩身份</th>
                <th className="h-10 px-3 text-left font-medium">CSMS</th>
                <th className="h-10 px-3 text-left font-medium">型号</th>
                <th className="h-10 px-3 text-right font-medium">枪口</th>
              </tr>
            </thead>
            <tbody>
              {chargingPointsQuery.isLoading && (
                <tr>
                  <td className="h-16 px-3 text-muted-foreground" colSpan={5}>
                    加载中
                  </td>
                </tr>
              )}
              {chargingPointsQuery.isError && (
                <tr>
                  <td className="h-16 px-3 text-destructive" colSpan={5}>
                    列表加载失败
                  </td>
                </tr>
              )}
              {!chargingPointsQuery.isLoading &&
                !chargingPointsQuery.isError &&
                items.length === 0 && (
                  <tr>
                    <td className="h-16 px-3 text-muted-foreground" colSpan={5}>
                      暂无桩实例
                    </td>
                  </tr>
                )}
              {items.map((item) => (
                <tr
                  key={item.id}
                  data-selected={item.id === selectedId}
                  className="border-t border-border hover:bg-muted/60 data-[selected=true]:bg-muted"
                >
                  <td className="h-12 px-3">
                    <button
                      type="button"
                      className="flex max-w-56 appearance-none flex-col gap-0.5 rounded-md border-0 bg-transparent p-0 text-left text-inherit outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => selectChargingPoint(item.id)}
                    >
                      <span className="truncate font-medium">{item.name}</span>
                      {item.description && (
                        <span className="truncate text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="h-12 px-3 font-mono text-xs">{item.identity}</td>
                  <td className="h-12 px-3">
                    <span className="block max-w-72 truncate">
                      {item.centralSystemUrl}
                    </span>
                  </td>
                  <td className="h-12 px-3">
                    {item.vendor} / {item.model}
                  </td>
                  <td className="h-12 px-3 text-right tabular-nums">
                    {item.connectorCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
