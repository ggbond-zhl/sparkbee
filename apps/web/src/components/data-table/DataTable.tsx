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

import { Button } from "@/components/ui/button";
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
  rowSelection?: RowSelectionState;
  tableClassName?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyText,
  emptyClassName,
  getRowId,
  getRowState,
  onRowSelectionChange,
  rowSelection,
  tableClassName,
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
          已选择 {selectedCount} / {rowCount} 行
        </div>
        <div className="flex items-center gap-2">
          <Button disabled type="button" variant="outline">
            上一页
          </Button>
          <Button disabled type="button" variant="outline">
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
