"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type Row,
  type RowSelectionState,
} from "@tanstack/react-table";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyText: string;
  emptyClassName?: string;
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  getRowState?: (row: Row<TData>) => string | undefined;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  page?: number;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  rowSelection?: RowSelectionState;
  tableClassName?: string;
  total?: number;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyText,
  emptyClassName,
  getRowId,
  getRowState,
  onRowSelectionChange,
  onPageChange,
  onPageSizeChange,
  page = 1,
  pageSize,
  pageSizeOptions = [],
  rowSelection,
  tableClassName,
  total = data.length,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    columns,
    data,
    enableRowSelection: Boolean(onRowSelectionChange),
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    onRowSelectionChange,
    state: rowSelection ? { rowSelection } : undefined,
  });
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;
  const selectedCount = table.getSelectedRowModel().rows.length;
  const rowCount = rows.length;
  const totalPages = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPreviousPage = page > 1;
  const canNextPage = page < totalPages;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border">
        <Table className={tableClassName}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={
                    row.getIsSelected() ? "selected" : getRowState?.(row)
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className={cn("text-muted-foreground", emptyClassName)}
                  colSpan={columnCount}
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          已选择 {selectedCount} / {rowCount} 行，共 {total} 条
        </div>
        <div className="flex items-center gap-2">
          {pageSize && onPageSizeChange ? (
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
                  onValueChange={(value) => onPageSizeChange(Number(value))}
                >
                  {pageSizeOptions.map((option) => (
                    <DropdownMenuRadioItem key={option} value={String(option)}>
                      {option}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <span className="text-muted-foreground tabular-nums">
            第 {page} / {totalPages} 页
          </span>
          <Button
            disabled={!canPreviousPage || !onPageChange}
            type="button"
            variant="outline"
            onClick={() => onPageChange?.(page - 1)}
          >
            上一页
          </Button>
          <Button
            disabled={!canNextPage || !onPageChange}
            type="button"
            variant="outline"
            onClick={() => onPageChange?.(page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
