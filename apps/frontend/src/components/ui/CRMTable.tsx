import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type RowSelectionState,
  type PaginationState,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CRMButton } from './CRMButton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CRMTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  selectable?: boolean;
  onSelectionChange?: (rows: TData[]) => void;
  bulkActions?: BulkAction[];
  defaultPageSize?: number;
  className?: string;
}

interface BulkAction {
  label: string;
  onClick: (selectedIds: string[]) => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: React.ReactNode;
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className={cn('skeleton h-4 rounded', i === 0 ? 'w-32' : 'w-24')} />
        </td>
      ))}
    </tr>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({
  message,
  icon,
}: {
  message: string;
  icon?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={99}>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
          {icon && <div className="text-gray-300">{icon}</div>}
          <p className="text-sm">{message}</p>
        </div>
      </td>
    </tr>
  );
}

// ─── Page size selector ───────────────────────────────────────────────────────

const PAGE_SIZES = [20, 50, 100] as const;

// ─── Main Component ───────────────────────────────────────────────────────────

function CRMTable<TData extends object>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data found',
  emptyIcon,
  selectable = false,
  onSelectionChange,
  bulkActions = [],
  defaultPageSize = 20,
  className,
}: CRMTableProps<TData>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

  // Prepend checkbox column when selectable
  const allColumns: ColumnDef<TData, unknown>[] = selectable
    ? [
        {
          id: '__select__',
          size: 40,
          header: ({ table }) => (
            <input
              type="checkbox"
              checked={table.getIsAllPageRowsSelected()}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              className="h-4 w-4 rounded border-gray-300 accent-primary"
            />
          ),
          cell: ({ row }) => (
            <input
              type="checkbox"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
              className="h-4 w-4 rounded border-gray-300 accent-primary"
            />
          ),
        },
        ...columns,
      ]
    : columns;

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { rowSelection, pagination },
    onRowSelectionChange: (updater) => {
      setRowSelection(updater);
      if (onSelectionChange) {
        const newState =
          typeof updater === 'function' ? updater(rowSelection) : updater;
        const selectedRows = data.filter((_, i) => newState[i]);
        onSelectionChange(selectedRows);
      }
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: selectable,
    manualPagination: false,
  });

  const selectedCount = Object.keys(rowSelection).length;
  const showBulkBar = selectable && selectedCount > 0 && bulkActions.length > 0;

  const rows = table.getRowModel().rows;

  return (
    <div className={cn('relative flex flex-col', className)}>
      {/* ─── Mobile: card list (below md) ─────────────────────────── */}
      <div className="flex flex-col gap-2 p-2 md:hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-card border border-gray-100 bg-white p-3">
              <div className="skeleton h-4 w-1/2 rounded" />
              <div className="skeleton mt-2 h-3 w-3/4 rounded" />
              <div className="skeleton mt-2 h-3 w-2/3 rounded" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
            {emptyIcon && <div className="text-gray-300">{emptyIcon}</div>}
            <p className="text-sm">{emptyMessage}</p>
          </div>
        ) : (
          rows.map((row) => {
            const visibleCells = row.getVisibleCells();
            const selectCell = selectable
              ? visibleCells.find((c) => c.column.id === '__select__')
              : undefined;
            const dataCells = visibleCells.filter((c) => c.column.id !== '__select__');
            return (
              <div
                key={row.id}
                className={cn(
                  'rounded-card border bg-white p-3 shadow-sm transition-colors',
                  row.getIsSelected() ? 'border-primary/40 bg-accent/40' : 'border-gray-100',
                )}
              >
                {selectCell && (
                  <div className="mb-2 flex items-center gap-2 border-b border-gray-50 pb-2">
                    {flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}
                    <span className="text-xs font-medium text-gray-400">Select</span>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  {dataCells.map((cell) => {
                    const headerDef = cell.column.columnDef.header;
                    const headerCtx = table.getHeaderGroups()[0]?.headers.find((h) => h.column.id === cell.column.id);
                    return (
                      <div key={cell.id} className="flex items-start justify-between gap-3">
                        <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          {headerCtx && !headerCtx.isPlaceholder
                            ? flexRender(headerDef, headerCtx.getContext())
                            : null}
                        </div>
                        <div className="min-w-0 flex-1 text-right text-sm text-gray-700">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── Desktop: table (md and up) ─────────────────────────────── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          {/* Sticky header */}
          <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-gray-100">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={allColumns.length} />
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <EmptyState message={emptyMessage} icon={emptyIcon} />
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-gray-50 transition-colors hover:bg-accent/50',
                    row.getIsSelected() && 'bg-accent/70',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-gray-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 border-t border-gray-100 px-3 py-3 sm:px-4">
        {/* Page size */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="hidden sm:inline">Rows per page:</span>
          <span className="sm:hidden">Rows:</span>
          <div className="relative">
            <select
              value={pagination.pageSize}
              onChange={(e) =>
                setPagination((p) => ({ ...p, pageSize: Number(e.target.value), pageIndex: 0 }))
              }
              className="appearance-none rounded-lg border border-gray-200 bg-white py-1 pl-3 pr-7 text-sm text-gray-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
              <option value={data.length}>All</option>
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>

        {/* Page info + nav */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            {' – '}
            {Math.min(
              (table.getState().pagination.pageIndex + 1) *
                table.getState().pagination.pageSize,
              data.length,
            )}
            {' of '}
            {data.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar — slides up when rows selected */}
      {showBulkBar && (
        <div className="slide-up fixed bottom-3 left-3 right-3 z-50 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
          <div className="glass flex flex-wrap items-center justify-center gap-2 px-3 py-2.5 shadow-hover sm:flex-nowrap sm:gap-3 sm:px-5 sm:py-3">
            <span className="text-sm font-semibold text-gray-700">
              {selectedCount} selected
            </span>
            <div className="h-4 w-px bg-gray-200" />
            {bulkActions.map((action, i) => (
              <CRMButton
                key={i}
                variant={action.variant ?? 'secondary'}
                size="sm"
                leftIcon={action.icon}
                onClick={() => action.onClick(Object.keys(rowSelection))}
              >
                {action.label}
              </CRMButton>
            ))}
            <button
              onClick={() => setRowSelection({})}
              className="ml-1 text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { CRMTable };
export type { CRMTableProps, BulkAction };
