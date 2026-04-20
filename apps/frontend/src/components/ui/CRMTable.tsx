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

  return (
    <div className={cn('relative flex flex-col', className)}>
      {/* Table wrapper */}
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
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
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        {/* Page size */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Rows per page:</span>
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
        <div className="slide-up fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="glass flex items-center gap-3 px-5 py-3 shadow-hover">
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
