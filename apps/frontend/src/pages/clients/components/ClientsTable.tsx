import { useMemo, useRef, useState, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  ChevronLeft, ChevronRight, ChevronDown, History, MessageCircle,
  MapPin, Tag as TagIcon, Users as UsersIcon,
} from 'lucide-react';
import { AvatarChip } from '@/components/ui/AvatarChip';
import type { ClientListItem } from '@/services/ordersApi';
import { cn } from '@/lib/cn';
import { formatDateShort } from '@/lib/orderFormat';

const PAGE_SIZES = [25, 50, 100] as const;

type Tag = ClientListItem['tag'];

const TAG_CONFIG: Record<Tag, { label: string; bg: string; text: string; dot: string }> = {
  normal:      { label: 'Normal',      bg: 'bg-gray-100',   text: 'text-gray-600',  dot: 'bg-gray-400'  },
  vip:         { label: 'VIP',         bg: 'bg-amber-100',  text: 'text-amber-700', dot: 'bg-amber-500' },
  blacklisted: { label: 'Blacklisted', bg: 'bg-red-100',    text: 'text-red-700',   dot: 'bg-red-500'   },
};

const TAG_ORDER: Tag[] = ['normal', 'vip', 'blacklisted'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(iso: string | null) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className={cn('skeleton h-4 rounded', i === 0 ? 'w-40' : 'w-20')} />
        </td>
      ))}
    </tr>
  );
}

// ─── Tag pill (with inline editor) ────────────────────────────────────────────

interface TagPillProps {
  tag: Tag;
  editable: boolean;
  pending: boolean;
  onChange: (tag: Tag) => void;
}

function TagPill({ tag, editable, pending, onChange }: TagPillProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = TAG_CONFIG[tag];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pill = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-badge px-2.5 py-0.5 text-[11px] font-semibold',
        cfg.bg, cfg.text,
        editable && 'cursor-pointer hover:brightness-95',
        pending && 'opacity-50',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
      {editable && <ChevronDown size={10} className="opacity-60" />}
    </span>
  );

  if (!editable) return pill;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="focus:outline-none"
      >
        {pill}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex min-w-[130px] flex-col overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
          {TAG_ORDER.map((t) => {
            const c = TAG_CONFIG[t];
            return (
              <button
                key={t}
                onClick={() => {
                  setOpen(false);
                  if (t !== tag) onChange(t);
                }}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent',
                  t === tag && 'bg-accent/50',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
                <span className={c.text}>{c.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClientsTableProps {
  clients: ClientListItem[];
  loading: boolean;
  canEditTag: boolean;
  onViewHistory: (client: ClientListItem) => void;
  onTagChange: (client: ClientListItem, tag: Tag) => Promise<void>;
  // Server-side pagination
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClientsTable({
  clients,
  loading,
  canEditTag,
  onViewHistory,
  onTagChange,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: ClientsTableProps) {
  const [pendingTagId, setPendingTagId] = useState<string | null>(null);

  const handleTag = async (client: ClientListItem, tag: Tag) => {
    setPendingTagId(client.id);
    try {
      await onTagChange(client, tag);
    } finally {
      setPendingTagId(null);
    }
  };

  const columns = useMemo<ColumnDef<ClientListItem, unknown>[]>(
    () => [
      // ── Name + avatar ─────────────────────────────────────────────────────
      {
        id: 'name',
        header: 'NAME',
        size: 240,
        cell: ({ row }) => (
          <button
            onClick={() => onViewHistory(row.original)}
            className="group flex items-center gap-2.5 text-left"
          >
            <AvatarChip
              name={row.original.fullName}
              subtitle={row.original.phoneDisplay}
              size="sm"
            />
          </button>
        ),
      },

      // ── Phone (WhatsApp shortcut) ─────────────────────────────────────────
      {
        id: 'phone',
        header: 'PHONE',
        size: 150,
        cell: ({ row }) => {
          const wa = `https://wa.me/${row.original.phoneDisplay.replace(/^0/, '212')}`;
          return (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-700">{row.original.phoneDisplay}</span>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-green-600 transition-colors hover:bg-green-50"
                title="Open WhatsApp"
              >
                <MessageCircle size={11} />
              </a>
            </div>
          );
        },
      },

      // ── City ──────────────────────────────────────────────────────────────
      {
        id: 'city',
        header: 'CITY',
        size: 140,
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-xs text-gray-700">
            <MapPin size={11} className="shrink-0 text-gray-400" />
            <span className="truncate">{row.original.city}</span>
          </div>
        ),
      },

      // ── Total orders ──────────────────────────────────────────────────────
      {
        id: 'totalOrders',
        header: 'ORDERS',
        size: 90,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 rounded-badge bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            {row.original.totalOrders}
          </span>
        ),
      },

      // ── Last order ────────────────────────────────────────────────────────
      {
        id: 'lastOrderAt',
        header: 'LAST ORDER',
        size: 130,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-700">
              {relativeDate(row.original.lastOrderAt)}
            </span>
            {row.original.lastOrderAt && (
              <span className="text-[10px] text-gray-400">
                {formatDateShort(row.original.lastOrderAt)}
              </span>
            )}
          </div>
        ),
      },

      // ── Tag pill (inline edit for admin/supervisor) ──────────────────────
      {
        id: 'tag',
        header: 'TAG',
        size: 130,
        cell: ({ row }) => (
          <TagPill
            tag={row.original.tag}
            editable={canEditTag}
            pending={pendingTagId === row.original.id}
            onChange={(t) => handleTag(row.original, t)}
          />
        ),
      },

      // ── Actions ───────────────────────────────────────────────────────────
      {
        id: 'actions',
        header: '',
        size: 60,
        cell: ({ row }) => (
          <button
            onClick={() => onViewHistory(row.original)}
            title="View history"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-accent hover:text-primary"
          >
            <History size={14} />
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clients, canEditTag, pendingTagId],
  );

  const table = useReactTable({
    data: clients,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  const colCount = columns.length;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-gray-100 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-gray-100">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize(), minWidth: header.getSize() }}
                    className="whitespace-nowrap px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: pageSize > 10 ? 10 : pageSize }).map((_, i) => (
                <SkeletonRow key={i} cols={colCount} />
              ))
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={colCount}>
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                    <UsersIcon size={42} className="text-gray-200" />
                    <p className="text-sm">No clients found</p>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const blacklisted = row.original.tag === 'blacklisted';
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-gray-50 transition-colors hover:bg-accent/60',
                      blacklisted && 'border-l-2 border-l-red-400',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle text-gray-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="text-xs">Rows per page:</span>
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-1 pl-3 pr-7 text-xs text-gray-700 focus:border-primary focus:outline-none"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <TagIcon size={11} className="text-gray-300" />
            {rangeStart} – {rangeEnd} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + i;
              else p = page - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors',
                    page === p
                      ? 'bg-primary text-white'
                      : 'border border-gray-200 text-gray-500 hover:border-primary hover:text-primary',
                  )}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
