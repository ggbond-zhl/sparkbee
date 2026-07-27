import { useParams } from "@tanstack/react-router";
import type { ProtocolConfigurationItem } from "@spark-bee/contracts";
import { RotateCcwIcon, SearchIcon } from "lucide-react";
import type { FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ProtocolConfigurationFilter } from "@/features/charging-points/model/protocolConfiguration";
import { useProtocolConfigurationWorkbench } from "@/features/charging-points/model/useProtocolConfigurationWorkbench";

const filterOptions = [
  { value: "all", label: "全部" },
  { value: "writable", label: "可写" },
  { value: "readonly", label: "只读" },
  { value: "pending-restart", label: "待重启" },
] as const satisfies ReadonlyArray<{
  value: ProtocolConfigurationFilter;
  label: string;
}>;

const sourceLabels: Record<ProtocolConfigurationItem["lastModifiedBy"], string> = {
  ui: "界面",
  csms: "CSMS",
  internal: "内部同步",
  initialization: "初始值",
};

export function ChargingPointConfigurationPage() {
  const { chargingPointId } = useParams({
    from: "/charging-points/$chargingPointId/configuration",
  });
  const workbench = useProtocolConfigurationWorkbench(chargingPointId);

  if (workbench.status === "loading") {
    return <PageState text="协议配置加载中" />;
  }
  if (workbench.status === "error") {
    return <PageState className="text-destructive" text="协议配置加载失败" />;
  }
  const {
    editor,
    filter,
    filteredItems,
    items,
    keyword,
    protocol,
    setFilter,
    setKeyword,
  } = workbench;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <FieldGroup className="max-w-xl flex-row gap-2">
          <Field>
            <FieldLabel className="sr-only" htmlFor="configuration-search">
              搜索配置
            </FieldLabel>
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="configuration-search"
                className="pl-8"
                placeholder="搜索配置键或说明"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
          </Field>
        </FieldGroup>
        <ToggleGroup
          aria-label="配置筛选"
          className="max-w-full overflow-x-auto"
          size="sm"
          type="single"
          value={filter}
          variant="outline"
          onValueChange={(value) => {
            if (value) setFilter(value as ProtocolConfigurationFilter);
          }}
        >
          {filterOptions.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{protocol}</span>
        <span>显示 {filteredItems.length} / {items.length} 项</span>
      </div>

      {filteredItems.length === 0 ? (
        <PageState text="没有符合条件的协议配置" />
      ) : (
        <>
          <ConfigurationTable items={filteredItems} onEdit={editor.open} />
          <ConfigurationCardList items={filteredItems} onEdit={editor.open} />
        </>
      )}

      <ConfigurationEditor
        draftValue={editor.draftValue}
        item={editor.item}
        pending={editor.pending}
        onDraftValueChange={editor.setDraftValue}
        onOpenChange={editor.setOpen}
        onRestoreDefault={editor.restoreDefault}
        onSubmit={(event) => {
          event.preventDefault();
          editor.save();
        }}
      />
    </section>
  );
}

function ConfigurationTable({
  items,
  onEdit,
}: {
  items: ProtocolConfigurationItem[];
  onEdit(item: ProtocolConfigurationItem): void;
}) {
  return (
    <Card className="hidden md:flex">
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>配置项</TableHead>
              <TableHead>当前值</TableHead>
              <TableHead>默认值</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.key}>
                <TableCell className="max-w-80 whitespace-normal">
                  <div className="flex flex-col gap-1">
                    <span className="break-all font-mono text-xs">{item.key}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-64 whitespace-normal break-all">
                  {item.value || "—"}
                </TableCell>
                <TableCell className="max-w-64 whitespace-normal break-all text-muted-foreground">
                  {item.defaultValue || "—"}
                </TableCell>
                <TableCell>
                  <ConfigurationBadges item={item} />
                </TableCell>
                <TableCell className="text-right">
                  {!item.readonly && (
                    <Button
                      aria-label={`编辑 ${item.key}`}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => onEdit(item)}
                    >
                      编辑
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ConfigurationCardList({
  items,
  onEdit,
}: {
  items: ProtocolConfigurationItem[];
  onEdit(item: ProtocolConfigurationItem): void;
}) {
  return (
    <div className="grid gap-3 md:hidden">
      {items.map((item) => (
        <Card key={item.key} size="sm">
          <CardHeader>
            <CardTitle className="break-all font-mono text-sm">{item.key}</CardTitle>
            <CardDescription>{item.description}</CardDescription>
            <CardAction>
              <ConfigurationBadges item={item} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">当前值</dt>
              <dd className="min-w-0 break-all text-right">{item.value || "—"}</dd>
              <dt className="text-muted-foreground">默认值</dt>
              <dd className="min-w-0 break-all text-right text-muted-foreground">
                {item.defaultValue || "—"}
              </dd>
              <dt className="text-muted-foreground">修改来源</dt>
              <dd className="text-right">{sourceLabels[item.lastModifiedBy]}</dd>
            </dl>
          </CardContent>
          {!item.readonly && (
            <CardFooter className="justify-end">
              <Button
                aria-label={`编辑 ${item.key}`}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => onEdit(item)}
              >
                编辑
              </Button>
            </CardFooter>
          )}
        </Card>
      ))}
    </div>
  );
}

function ConfigurationBadges({ item }: { item: ProtocolConfigurationItem }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Badge variant={item.readonly ? "secondary" : "outline"}>
        {item.readonly ? "只读" : "可写"}
      </Badge>
      {item.pendingRestart && <Badge variant="destructive">待重启</Badge>}
    </div>
  );
}

function ConfigurationEditor({
  draftValue,
  item,
  pending,
  onDraftValueChange,
  onOpenChange,
  onRestoreDefault,
  onSubmit,
}: {
  draftValue: string;
  item: ProtocolConfigurationItem | null;
  pending: boolean;
  onDraftValueChange(value: string): void;
  onOpenChange(open: boolean): void;
  onRestoreDefault(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑 {item?.key}</DialogTitle>
          <DialogDescription>{item?.description}</DialogDescription>
        </DialogHeader>
        {item && (
          <form className="flex flex-col gap-5" onSubmit={onSubmit}>
            <FieldGroup>
              <Field orientation={item.valueType === "boolean" ? "horizontal" : "vertical"}>
                <FieldLabel htmlFor="protocol-configuration-value">配置值</FieldLabel>
                {item.valueType === "boolean" ? (
                  <Switch
                    id="protocol-configuration-value"
                    checked={draftValue === "true"}
                    onCheckedChange={(checked) =>
                      onDraftValueChange(checked ? "true" : "false")}
                  />
                ) : (
                  <Input
                    id="protocol-configuration-value"
                    max={item.maxValue ?? undefined}
                    min={item.minValue ?? undefined}
                    type={item.valueType === "integer" ? "number" : "text"}
                    value={draftValue}
                    onChange={(event) => onDraftValueChange(event.target.value)}
                  />
                )}
                <FieldDescription>
                  {formatValueConstraint(item)} 当前版本 {item.version}。
                </FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                disabled={pending || draftValue === item.defaultValue}
                type="button"
                variant="outline"
                onClick={onRestoreDefault}
              >
                <RotateCcwIcon data-icon="inline-start" />
                恢复默认
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? "保存中" : "保存"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatValueConstraint(item: ProtocolConfigurationItem): string {
  if (item.valueType === "boolean") return "可选择启用或停用。";
  if (item.valueType !== "integer") return "请输入文本值。";
  if (item.minValue !== null && item.maxValue !== null) {
    return `允许 ${item.minValue} 到 ${item.maxValue} 的整数。`;
  }
  if (item.minValue !== null) return `请输入不小于 ${item.minValue} 的整数。`;
  if (item.maxValue !== null) return `请输入不大于 ${item.maxValue} 的整数。`;
  return "请输入整数。";
}

function PageState({ className, text }: { className?: string; text: string }) {
  return (
    <div className={`rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground ${className ?? ""}`}>
      {text}
    </div>
  );
}
