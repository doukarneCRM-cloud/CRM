import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  ChevronLeft, ChevronRight, ChevronDown, Edit2, Archive,
  UserPlus, MessageCircle, History, Send, MapPin, User,
  DownloadCloud, Check, Loader2,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OrderSourceIcon } from '@/components/ui/OrderSourceIcon';
import { CustomerOrdersBadge } from '@/components/ui/CustomerOrdersBadge';
import { integrationsApi } from '@/services/integrationsApi';
import type { Order } from '@/types/orders';
import { cn } from '@/lib/cn';
import { formatRef, formatDate } from '@/lib/orderFormat';

const PAGE_SIZES = [25, 50, 100] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str: string | null | undefined, n: number) {
  if (!str) return null;
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

// Deterministic palette per-agent so admins can tell assignees apart at a
// glance. Uses a name-based hash to stay stable across renders and pages.
const AGENT_COLORS: Array<{ border: string; text: string; bg: string }> = [
  { border: 'border-indigo-400', text: 'text-indigo-700', bg: 'bg-indigo-50' },
  { border: 'border-emerald-400', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  { border: 'border-amber-400', text: 'text-amber-700', bg: 'bg-amber-50' },
  { border: 'border-violet-400', text: 'text-violet-700', bg: 'bg-violet-50' },
  { border: 'border-sky-400', text: 'text-sky-700', bg: 'bg-sky-50' },
  { border: 'border-rose-400', text: 'text-rose-700', bg: 'bg-rose-50' },
  { border: 'border-teal-400', text: 'text-teal-700', bg: 'bg-teal-50' },
  { border: 'border-fuchsia-400', text: 'text-fuchsia-700', bg: 'bg-fuchsia-50' },
];

function agentColor(key: string) {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  return AGENT_COLORS[sum % AGENT_COLORS.length];
}

// ─── Quick import button for unlinked YouCan products (admin-only) ──────────

interface QuickImportButtonProps {
  storeId: string;
  youcanId: string;
  productName: string;
  onImported: () => void;
}

function QuickImportButton({ storeId, youcanId, productName, onImported }: QuickImportButtonProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const run = async (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (state !== 'idle') return;
    setState('busy');
    try {
      await integrationsApi.importProducts(storeId, [youcanId]);
      setState('done');
      setTimeout(onImported, 600);
    } catch (err) {
      console.error('[QuickImport] failed:', err);
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  };

  const titleByState: Record<typeof state, string> = {
    idle: t('orders.quickImport.idle', { productName }),
    busy: t('orders.quickImport.busy'),
    done: t('orders.quickImport.done'),
    error: t('orders.quickImport.error'),
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={state === 'busy' || state === 'done'}
      className={cn(
        'ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full align-middle transition',
        state === 'idle' && 'bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-900',
        state === 'busy' && 'bg-amber-100 text-amber-500',
        state === 'done' && 'bg-emerald-100 text-emerald-700',
        state === 'error' && 'bg-red-100 text-red-700 hover:bg-red-200',
      )}
      title={titleByState[state]}
    >
      {state === 'busy' ? (
        <Loader2 size={11} className="animate-spin" />
      ) : state === 'done' ? (
        <Check size={11} />
      ) : (
        <DownloadCloud size={11} />
      )}
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td
          key={i}
          className={cn(
            'border-y border-gray-100 bg-white px-4 py-3',
            i === 0 && 'rounded-l-lg border-l',
            i === cols - 1 && 'rounded-r-lg border-r',
          )}
        >
          <div className={cn('skeleton h-4 rounded', i < 2 ? 'w-28' : 'w-20')} />
        </td>
      ))}
    </tr>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TableCallbacks {
  onEdit: (order: Order) => void;
  onArchive: (order: Order) => void;
  onAssign: (order: Order) => void;
  onViewLogs: (order: Order, type: 'all' | 'confirmation' | 'shipping') => void;
  onViewCustomer: (order: Order) => void;
  onRefresh: () => void;
  onSendColiix?: (order: Order) => void;
}

interface OrdersTableProps extends TableCallbacks {
  orders: Order[];
  loading: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  // Server-side pagination
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  // Admin-only: show the inline "import this YouCan product" button
  canImport: boolean;
  // Order ids currently being exported to Coliix (disables the button, shows spinner)
  sendingIds?: string[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrdersTable({
  orders,
  loading,
  selectedIds,
  onSelectionChange,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onArchive,
  onAssign,
  onViewLogs,
  onViewCustomer,
  onRefresh,
  canImport,
  onSendColiix,
  sendingIds,
}: OrdersTableProps) {
  const { t } = useTranslation();
  // Track selection state as Set for O(1) lookup
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const sendingSet = useMemo(() => new Set(sendingIds ?? []), [sendingIds]);

  const toggleAll = () => {
    if (selectedIds.length === orders.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(orders.map((o) => o.id));
    }
  };

  const toggleOne = (id: string) => {
    if (selectedSet.has(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const columns = useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      // ── Checkbox ──────────────────────────────────────────────────────────
      {
        id: '__select__',
        size: 40,
        header: () => (
          <input
            type="checkbox"
            checked={orders.length > 0 && selectedIds.length === orders.length}
            ref={(el) => {
              if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < orders.length;
            }}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-gray-300 accent-primary"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedSet.has(row.original.id)}
            onChange={() => toggleOne(row.original.id)}
            className="h-4 w-4 rounded border-gray-300 accent-primary"
          />
        ),
      },

      // ── Col 1: Ref / Date / Agent ─────────────────────────────────────────
      {
        id: 'ref',
        header: t('orders.columns.refDate'),
        size: 160,
        cell: ({ row }) => {
          const { prefix, seq } = formatRef(row.original.reference);
          const { date, time } = formatDate(row.original.createdAt);
          const agent = row.original.agent;
          return (
            <div>
              <p className="font-mono text-xs font-semibold text-gray-800">
                <span className="text-gray-400">{prefix}</span>
                {seq}
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400">{date} · {time}</p>
              <div className="mt-1 flex items-center gap-1">
                <User size={9} className="shrink-0 text-gray-300" />
                {agent ? (
                  (() => {
                    const c = agentColor(agent.id || agent.name);
                    return (
                      <span
                        title={agent.name}
                        className={cn(
                          'inline-flex max-w-full items-center truncate rounded-badge border-l-[3px] px-1.5 py-0.5 text-[10px] font-semibold',
                          c.border,
                          c.text,
                          c.bg,
                        )}
                      >
                        {agent.name}
                      </span>
                    );
                  })()
                ) : (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-orange-500">
                    {t('orders.unassigned')}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },

      // ── Col 3: Customer (name + phone + city + address) ──────────────────
      {
        id: 'customer',
        header: t('orders.columns.customer'),
        size: 240,
        cell: ({ row }) => {
          const { customer } = row.original;
          const waLink = `https://wa.me/${customer.phoneDisplay.replace(/^0/, '212')}`;
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onViewCustomer(row.original)}
                  className="truncate text-left text-sm font-semibold text-gray-900 hover:text-primary hover:underline"
                >
                  {customer.fullName}
                </button>
                <CustomerOrdersBadge count={customer._count?.orders} />
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-green-600 transition-colors hover:bg-green-50"
                  title={t('orders.whatsapp')}
                >
                  <MessageCircle size={11} />
                </a>
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-gray-400">{customer.phoneDisplay}</p>
              <div
                className="mt-1 flex items-start gap-1 text-[11px] text-gray-600"
                title={customer.address ? `${customer.city} · ${customer.address}` : customer.city}
              >
                <MapPin size={10} className="mt-0.5 shrink-0 text-gray-400" />
                <span className="min-w-0 truncate">
                  <span className="font-medium text-gray-700">{customer.city}</span>
                  {customer.address && (
                    <span className="text-gray-400"> · {truncate(customer.address, 28)}</span>
                  )}
                </span>
              </div>
            </div>
          );
        },
      },

      // ── Col 5: Product ────────────────────────────────────────────────────
      {
        id: 'product',
        header: t('orders.columns.product'),
        size: 160,
        cell: ({ row }) => {
          const items = row.original.items;
          const first = items[0];
          if (!first) return <span className="text-xs text-gray-300">—</span>;
          const productName = first.variant.product.name;
          const isPlaceholder = Boolean(first.variant.product.isPlaceholder);
          const isDeleted = Boolean(first.variant.product.deletedAt);
          const unlinked = isPlaceholder || isDeleted;
          const storeId = first.variant.product.storeId ?? null;
          const youcanId = first.variant.product.youcanId ?? null;
          const extra = items.length - 1;
          const hoverTitle = isDeleted
            ? t('orders.deletedProductBadge')
            : isPlaceholder
              ? t('orders.unlinkedProductBadge')
              : undefined;
          const showStockShort =
            Boolean(row.original.hasStockWarning) &&
            row.original.confirmationStatus === 'pending';
          return (
            <div>
              <p
                className={cn(
                  'text-sm font-semibold',
                  unlinked ? 'text-red-600' : 'text-gray-800',
                )}
                title={hoverTitle}
              >
                {truncate(productName, 20)}
                {canImport && unlinked && storeId && youcanId && (
                  <QuickImportButton
                    storeId={storeId}
                    youcanId={youcanId}
                    productName={productName}
                    onImported={onRefresh}
                  />
                )}
              </p>
              {showStockShort && (
                <p
                  className="text-[10px] font-medium leading-tight text-amber-600"
                  title={t('orders.stockShortTooltip')}
                >
                  {t('orders.stockShort')}
                </p>
              )}
              <div className="mt-0.5 flex flex-wrap gap-1">
                {first.variant.color && (
                  <span
                    className={cn(
                      'rounded-badge px-1.5 py-0.5 text-[9px] font-medium',
                      unlinked
                        ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                        : 'bg-gray-100 text-gray-600',
                    )}
                  >
                    {first.variant.color}
                  </span>
                )}
                {first.variant.size && (
                  <span
                    className={cn(
                      'rounded-badge px-1.5 py-0.5 text-[9px] font-medium',
                      unlinked
                        ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                        : 'bg-gray-100 text-gray-600',
                    )}
                  >
                    {first.variant.size}
                  </span>
                )}
                <span
                  className={cn(
                    'rounded-badge px-1.5 py-0.5 text-[9px] font-bold',
                    unlinked ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary',
                  )}
                >
                  ×{first.quantity}
                </span>
                {extra > 0 && (
                  <span className="rounded-badge bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500">
                    {t('orders.extraMore', { count: extra })}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },

      // ── Col 6: Price ──────────────────────────────────────────────────────
      {
        id: 'price',
        header: t('orders.columns.price'),
        size: 90,
        cell: ({ row }) => {
          const unlinked = row.original.items.some(
            (i) => i.variant.product.isPlaceholder || i.variant.product.deletedAt,
          );
          return (
            <div className="text-right">
              <span
                className={cn('text-sm font-bold', unlinked ? 'text-red-600' : 'text-gray-900')}
                title={unlinked ? t('orders.untrackedUnitTooltip') : undefined}
              >
                {row.original.total.toLocaleString('fr-MA')}
              </span>
              <span className={cn('ml-1 text-[10px]', unlinked ? 'text-red-400' : 'text-gray-400')}>MAD</span>
            </div>
          );
        },
      },

      // ── Col 7: Status (confirmation stacked above shipping) ──────────────
      {
        id: 'status',
        header: t('orders.columns.status'),
        size: 170,
        cell: ({ row }) => {
          const hasDeletedProduct = row.original.items.some((i) => i.variant.product.deletedAt);
          return (
          <div className="flex flex-col gap-1.5">
            {/* Confirmation (top) */}
            <div className="flex items-center gap-1">
              <span className="w-[14px] shrink-0 text-[9px] font-bold uppercase text-gray-300">C</span>
              <StatusBadge status={row.original.confirmationStatus} size="sm" showDot />
              {hasDeletedProduct && (
                <span
                  className="inline-flex items-center rounded-badge border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-600"
                  title={t('orders.notTrackedTooltip')}
                >
                  {t('orders.notTracked')}
                </span>
              )}
            </div>
            {/* Shipping (bottom) */}
            <div className="flex items-center gap-1">
              <span className="w-[14px] shrink-0 text-[9px] font-bold uppercase text-gray-300">S</span>
              <StatusBadge status={row.original.shippingStatus} size="sm" showDot />
              <button
                onClick={() => onViewLogs(row.original, 'all')}
                title={t('orders.viewHistory')}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-900 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <History size={11} />
              </button>
            </div>
          </div>
          );
        },
      },

      // ── Col 9: Notes ──────────────────────────────────────────────────────
      {
        id: 'notes',
        header: t('orders.columns.notes'),
        size: 160,
        cell: ({ row }) => {
          const { confirmationNote, shippingInstruction } = row.original;
          if (!confirmationNote && !shippingInstruction) {
            return <span className="text-xs text-gray-200">—</span>;
          }
          return (
            <div className="group relative">
              {confirmationNote && (
                <p className="truncate text-[11px] text-gray-600">{confirmationNote}</p>
              )}
              {shippingInstruction && (
                <p className="truncate text-[11px] text-blue-500">{shippingInstruction}</p>
              )}
              {/* Hover tooltip */}
              {(confirmationNote || shippingInstruction) && (
                <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-1 hidden w-52 rounded-xl border border-gray-100 bg-white p-3 shadow-lg group-hover:block">
                  {confirmationNote && (
                    <p className="text-xs text-gray-700">{confirmationNote}</p>
                  )}
                  {shippingInstruction && (
                    <p className="mt-1 text-xs text-blue-600">{shippingInstruction}</p>
                  )}
                </div>
              )}
            </div>
          );
        },
      },

      // ── Col 10: Source ────────────────────────────────────────────────────
      {
        id: 'source',
        header: t('orders.columns.source'),
        size: 50,
        cell: ({ row }) => (
          <OrderSourceIcon source={row.original.source} size={13} />
        ),
      },

      // ── Col 11: Coliix ───────────────────────────────────────────────────
      {
        id: 'coliix',
        header: t('orders.columns.coliix'),
        size: 80,
        cell: ({ row }) => {
          const order = row.original;
          if (order.labelSent) {
            return (
              <span
                className="flex items-center gap-1 text-xs font-semibold text-green-600"
                title={order.coliixTrackingId ? t('orders.coliixTrackingTooltip', { tracking: order.coliixTrackingId }) : t('orders.coliixSentTooltip')}
              >
                <Check size={10} /> {t('orders.sent')}
              </span>
            );
          }
          if (order.confirmationStatus !== 'confirmed') {
            return <span className="text-xs text-gray-200" title={t('orders.onlyConfirmedCanSend')}>—</span>;
          }
          const sending = sendingSet.has(order.id);
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSendColiix?.(order);
              }}
              disabled={sending || !onSendColiix}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              title={t('orders.sendingTooltip')}
            >
              {sending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
              {sending ? t('orders.sending') : t('orders.send')}
            </button>
          );
        },
      },

      // ── Col 12: Actions ───────────────────────────────────────────────────
      {
        id: 'actions',
        header: '',
        size: 90,
        cell: ({ row }) => (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onEdit(row.original)}
              title={t('orders.editOrder')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-900 transition-colors hover:bg-gray-100"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={() => onAssign(row.original)}
              title={t('orders.assignAgent')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-900 transition-colors hover:bg-accent"
            >
              <UserPlus size={13} />
            </button>
            <button
              onClick={() => onArchive(row.original)}
              title={t('orders.archiveOrder')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-900 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Archive size={13} />
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, selectedIds, selectedSet, t],
  );

  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  const colCount = columns.length;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-gray-100 bg-white">
      {/* ─── Mobile: card list (below md) ──────────────────────────── */}
      <div className="flex flex-col gap-3 p-3 md:hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
              <div className="skeleton h-4 w-1/2 rounded" />
              <div className="skeleton mt-2 h-3 w-3/4 rounded" />
              <div className="skeleton mt-2 h-3 w-2/3 rounded" />
            </div>
          ))
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <p className="text-sm">{t('orders.noOrdersFound')}</p>
          </div>
        ) : (
          rows.map((row) => {
            const byId = new Map(row.getVisibleCells().map((c) => [c.column.id, c]));
            const get = (id: string) => byId.get(id);
            const renderCell = (id: string) => {
              const cell = get(id);
              if (!cell) return null;
              return flexRender(cell.column.columnDef.cell, cell.getContext());
            };
            const isSelected = selectedSet.has(row.original.id);
            return (
              <div
                key={row.id}
                className={cn(
                  'rounded-card border bg-white shadow-card transition-shadow',
                  isSelected ? 'border-primary/50 bg-accent/30 shadow-hover' : 'border-gray-100',
                )}
              >
                {/* ── Header: checkbox + ref/date/agent + actions ── */}
                <div className="flex items-start gap-2 p-3">
                  <div className="mt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {renderCell('__select__')}
                  </div>
                  <div className="min-w-0 flex-1">{renderCell('ref')}</div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {renderCell('actions')}
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* ── Customer ── */}
                <div className="px-3 py-2.5">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('orders.columns.customer')}</p>
                  {renderCell('customer')}
                </div>

                <div className="border-t border-gray-50" />

                {/* ── Product ── */}
                <div className="px-3 py-2.5">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('orders.columns.product')}</p>
                  {renderCell('product')}
                </div>

                <div className="border-t border-gray-50" />

                {/* ── Price ── */}
                <div className="flex items-center justify-between px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('orders.columns.price')}</p>
                  <div>{renderCell('price')}</div>
                </div>

                <div className="border-t border-gray-50" />

                {/* ── Status ── */}
                <div className="px-3 py-2.5">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('orders.columns.status')}</p>
                  {renderCell('status')}
                </div>

                {/* ── Meta row (source, coliix, notes) — compact, only if any has value ── */}
                {(() => {
                  const hasSource = get('source');
                  const hasColiix = get('coliix');
                  const hasNotes = get('notes');
                  if (!hasSource && !hasColiix && !hasNotes) return null;
                  return (
                    <>
                      <div className="border-t border-gray-50" />
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-[11px] text-gray-500">
                        {hasSource && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('orders.columns.source')}</span>
                            <div>{renderCell('source')}</div>
                          </div>
                        )}
                        {hasColiix && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('orders.columns.coliix')}</span>
                            <div>{renderCell('coliix')}</div>
                          </div>
                        )}
                        {hasNotes && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('orders.columns.notes')}</span>
                            <div>{renderCell('notes')}</div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* ─── Desktop: table (md and up) ──────────────────────────────
          Each row is rendered as a self-contained card (rounded ends,
          rule borders, hover lift) to match the Call Center layout —
          we use `border-separate` so the spacing between rows reads as
          a real gap rather than a hairline. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-y-1.5 text-sm">
          {/* Sticky header */}
          <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize(), minWidth: header.getSize() }}
                    className="whitespace-nowrap border-b border-gray-100 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400"
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
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={colCount}>
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                      <rect x="9" y="3" width="6" height="4" rx="1" />
                    </svg>
                    <p className="text-sm">{t('orders.noOrdersFound')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isSelected = selectedSet.has(row.original.id);
                return (
                  <tr key={row.id} className="group transition-colors">
                    {row.getVisibleCells().map((cell, idx, arr) => (
                      <td
                        key={cell.id}
                        className={cn(
                          'border-y border-gray-100 px-3 py-2 align-top text-gray-700 transition-colors',
                          'group-hover:border-primary/30 group-hover:bg-primary/5',
                          isSelected ? 'bg-accent/60' : 'bg-white',
                          idx === 0 && 'rounded-l-lg border-l',
                          idx === arr.length - 1 && 'rounded-r-lg border-r',
                        )}
                      >
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
      <div className="flex flex-wrap items-center justify-between gap-y-2 border-t border-gray-100 px-3 py-3 sm:px-4">
        {/* Rows per page */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="text-xs">{t('orders.rowsPerPage')}</span>
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

        {/* Page info + navigation */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{t('orders.pageRange', { start: rangeStart, end: rangeEnd, total: total.toLocaleString() })}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            {/* Page number pills */}
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
