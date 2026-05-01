import { useEffect, useMemo, useState, useCallback, useRef, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  History, MessageCircle, Send, Package, Phone, StickyNote, PhoneOff, Truck, Search, X,
  Copy, Check, Plus,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { CustomerOrdersBadge } from '@/components/ui/CustomerOrdersBadge';
import { OrderSourceIcon } from '@/components/ui/OrderSourceIcon';
import { ordersApi } from '@/services/ordersApi';
import { getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import {
  CONFIRMATION_STATUS_COLORS,
  SHIPPING_STATUS_COLORS,
  getStatusConfig,
  type ConfirmationStatus,
  type ShippingStatus,
} from '@/constants/statusColors';
import type { Order } from '@/types/orders';
import { cn } from '@/lib/cn';
import { formatRef, formatDate } from '@/lib/orderFormat';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useCallCenterStore } from '../callCenterStore';
import { OrderLogsModal } from '@/pages/orders/components/OrderLogsModal';
import { CustomerHistoryModal } from '@/pages/orders/components/CustomerHistoryModal';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isCallbackOverdue(order: Order) {
  if (order.confirmationStatus !== 'callback' || !order.callbackAt) return false;
  return new Date(order.callbackAt).getTime() <= Date.now();
}

// "Today" = the local calendar day. Any callback scheduled for today needs an
// action from the agent today, whether the time has passed yet or not.
function isCallbackToday(order: Order) {
  if (order.confirmationStatus !== 'callback' || !order.callbackAt) return false;
  const at = new Date(order.callbackAt);
  const now = new Date();
  return (
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate()
  );
}

// Group order items by product name. When the same product has multiple
// variants (e.g. Beige/S and Noir/M) we show a single product name followed
// by a chip per variation, keeping the row compact but complete.
// `unlinked` flags rows whose product is either a placeholder (never imported)
// or tombstoned (deleted from catalog) — both cases mean the agent is looking
// at an untracked item and should flag it to the admin for re-import.
interface ProductGroup {
  name: string;
  variants: Array<{ label: string; quantity: number }>;
  totalQty: number;
  unlinked: boolean;
  isDeleted: boolean;
  storeId: string | null;
  youcanId: string | null;
}

function groupItems(order: Order): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const item of order.items) {
    const name = item.variant.product?.name ?? '—';
    const parts = [item.variant.color, item.variant.size].filter(Boolean) as string[];
    const label = parts.length ? parts.join(' / ') : 'Default';
    const placeholder = Boolean(item.variant.product?.isPlaceholder);
    const deleted = Boolean(item.variant.product?.deletedAt);
    const unlinked = placeholder || deleted;
    const storeId = item.variant.product?.storeId ?? null;
    const youcanId = item.variant.product?.youcanId ?? null;
    const group = map.get(name);
    if (group) {
      group.variants.push({ label, quantity: item.quantity });
      group.totalQty += item.quantity;
      group.unlinked = group.unlinked || unlinked;
      group.isDeleted = group.isDeleted || deleted;
      if (!group.storeId && storeId) group.storeId = storeId;
      if (!group.youcanId && youcanId) group.youcanId = youcanId;
    } else {
      map.set(name, {
        name,
        variants: [{ label, quantity: item.quantity }],
        totalQty: item.quantity,
        unlinked,
        isDeleted: deleted,
        storeId,
        youcanId,
      });
    }
  }
  return Array.from(map.values());
}

// Quick one-click confirmation transitions available from pending/callback.
// Richer transitions (cancel / callback with date / etc.) require the modal.
const QUICK_CONFIRMATION_TRANSITIONS: Array<{
  from: ConfirmationStatus[];
  to: ConfirmationStatus;
  labelKey: 'quickConfirmed' | 'quickUnreachablePlus1' | 'quickPending';
}> = [
  { from: ['pending', 'callback', 'unreachable'], to: 'confirmed', labelKey: 'quickConfirmed' },
  // Allow repeat "unreachable" from the unreachable state itself so agents can
  // log another failed attempt in one click; the backend increments the counter
  // on every submission regardless of current status.
  { from: ['pending', 'callback', 'unreachable'], to: 'unreachable', labelKey: 'quickUnreachablePlus1' },
  { from: ['unreachable', 'callback'], to: 'pending', labelKey: 'quickPending' },
];

// ─── Pill: colorful, clickable confirmation status ───────────────────────────

interface ConfirmationPillProps {
  order: Order;
  onOpenModal: () => void;
  onRefresh: () => void;
}

function ConfirmationPill({ order, onOpenModal, onRefresh }: ConfirmationPillProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = CONFIRMATION_STATUS_COLORS[order.confirmationStatus as ConfirmationStatus];

  useClickOutside(ref, () => setOpen(false), open);

  const quickActions = QUICK_CONFIRMATION_TRANSITIONS.filter((q) =>
    q.from.includes(order.confirmationStatus as ConfirmationStatus),
  );

  const apply = async (to: ConfirmationStatus) => {
    setBusy(true);
    try {
      await ordersApi.updateStatus(order.id, { confirmationStatus: to });
      onRefresh();
    } catch {
      // fallback — open modal for detailed handling
      onOpenModal();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  if (!cfg) return null;

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-[11px] font-semibold transition',
          cfg.bg,
          cfg.text,
          'hover:ring-2 hover:ring-primary/20',
          busy && 'opacity-60',
        )}
        title={t('callCenter.row.changeConfirmationStatus')}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
        {cfg.label}
        {order.unreachableCount > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
            <PhoneOff size={8} /> ×{order.unreachableCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 z-20 mt-1 flex min-w-[180px] flex-col gap-1 rounded-card border border-gray-200 bg-white p-1.5 shadow-hover"
          onClick={(e) => e.stopPropagation()}
        >
          {quickActions.map((act) => {
            const target = CONFIRMATION_STATUS_COLORS[act.to];
            return (
              <button
                key={act.to}
                type="button"
                onClick={() => apply(act.to)}
                disabled={busy}
                className="flex items-center gap-2 rounded-btn px-2 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-accent"
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', target.dot)} />
                {t(`callCenter.row.${act.labelKey}` as const)}
              </button>
            );
          })}
          {quickActions.length > 0 && <div className="my-0.5 h-px bg-gray-100" />}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenModal();
            }}
            className="flex items-center gap-2 rounded-btn bg-primary/10 px-2 py-1.5 text-left text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Send size={11} />
            {t('callCenter.row.openFullActions')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Pill: shipping status (read-only display in call center) ────────────────

function ShippingPill({ order }: { order: Order }) {
  const { t } = useTranslation();
  const cfg = SHIPPING_STATUS_COLORS[order.shippingStatus as ShippingStatus];
  if (!cfg) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-[11px] font-semibold',
        cfg.bg,
        cfg.text,
      )}
      title={t('callCenter.row.shippingTooltip', { label: cfg.label })}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

interface RowProps {
  order: Order;
  onOpenLogs: (order: Order, type: 'all' | 'confirmation' | 'shipping') => void;
  onOpenCustomer: (customerId: string) => void;
  onRefresh: () => void;
}

function Row({ order, onOpenLogs, onOpenCustomer, onRefresh }: RowProps) {
  const { t } = useTranslation();
  const openOrder = useCallCenterStore((s) => s.openOrder);
  const groups = useMemo(() => groupItems(order), [order]);
  const totalItems = groups.reduce((n, g) => n + g.totalQty, 0);
  const hasUnlinked = groups.some((g) => g.unlinked);
  const { prefix, seq } = formatRef(order.reference);
  const { date, time } = formatDate(order.createdAt);
  const overdue = isCallbackOverdue(order);
  const callbackToday = isCallbackToday(order);
  // Past-due callbacks from earlier days get the red pulse; today's pending
  // callbacks get an amber "call me today" highlight so agents can triage by
  // urgency at a glance.
  const todayHighlight = callbackToday && !overdue;

  const phoneDigits = order.customer.phoneDisplay.replace(/\D/g, '');
  // MA country code: strip leading 0 and prefix 212 so wa.me resolves to the
  // right number whether the stored value keeps the local 0 or not.
  const wa = `https://wa.me/212${phoneDigits.replace(/^0/, '')}`;
  const [phoneCopied, setPhoneCopied] = useState(false);
  const copyPhone = useCallback(async (e: MouseEvent) => {
    e.stopPropagation();
    if (!order.customer.phoneDisplay) return;
    try {
      await navigator.clipboard.writeText(order.customer.phoneDisplay);
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 1200);
    } catch {
      // Clipboard API may be blocked on insecure contexts — fail silent.
    }
  }, [order.customer.phoneDisplay]);

  return (
    <div
      className={cn(
        'group rounded-card border border-transparent bg-white/60 transition',
        'md:flex md:flex-col md:gap-2 md:px-3 md:py-2.5',
        'md:hover:border-primary/30 md:hover:bg-primary/5 md:hover:shadow-sm',
        overdue && 'callback-pulse border-pink-300/70 bg-pink-50/60 md:hover:bg-pink-50',
        todayHighlight && 'callback-today-pulse border-sky-300/70 bg-sky-50/70 md:hover:bg-sky-50',
        'shadow-card md:shadow-none',
      )}
    >
      {/* ─── Mobile card (below md) ─────────────────────────────── */}
      <div className="flex flex-col md:hidden">
        {/* Header: ref + date + source + quick open */}
        <button
          type="button"
          onClick={() => openOrder(order)}
          className="flex items-center gap-2 rounded-t-card px-3 py-2 text-left active:bg-primary/5"
        >
          <OrderSourceIcon source={order.source} size={16} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[12px] font-semibold text-gray-800">
              <span className="text-gray-400">{prefix}</span>{seq}
            </p>
            <p className="text-[10px] text-gray-400">{date} · {time}</p>
          </div>
          <span
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-sm',
            )}
          >
            <Send size={12} />
          </span>
        </button>

        <div className="h-px bg-gray-100" />

        {/* Customer */}
        <div className="flex items-start gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCustomer(order.customer.id);
                }}
                className="truncate text-left text-sm font-semibold text-gray-900 hover:text-primary active:text-primary"
              >
                {order.customer.fullName}
              </button>
              <CustomerOrdersBadge count={order.customer._count?.orders} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-gray-500">
              <span className="font-mono">{order.customer.phoneDisplay}</span>
              <span className="text-gray-300">·</span>
              <span className="truncate">{order.customer.city}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={`tel:${phoneDigits}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary active:bg-primary/20"
              title={t('callCenter.row.call')}
            >
              <Phone size={13} />
            </a>
            <button
              type="button"
              onClick={copyPhone}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full transition',
                phoneCopied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200',
              )}
              title={phoneCopied ? t('callCenter.row.copied') : t('callCenter.row.copyPhone')}
            >
              {phoneCopied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm active:from-emerald-600 active:to-emerald-700"
              title={t('callCenter.row.openWhatsapp')}
            >
              <MessageCircle size={18} strokeWidth={2.2} />
            </a>
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Products */}
        <div className="flex items-start gap-2 px-3 py-2">
          <div className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-btn bg-accent/60">
            <Package size={12} className="text-primary" />
            {totalItems > 1 && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {totalItems}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {groups.length === 0 ? (
              <p className="text-sm font-medium text-gray-400">—</p>
            ) : (
              groups.map((g, gi) => (
                <div key={gi} className="min-w-0">
                  <p
                    className={cn(
                      'text-[13px] font-medium leading-tight',
                      g.unlinked ? 'text-red-600' : 'text-gray-800',
                    )}
                  >
                    {g.name}
                  </p>
                  {gi === 0 && order.hasStockWarning && order.confirmationStatus === 'pending' && (
                    <p
                      className="text-[10px] font-medium leading-tight text-amber-600"
                      title={t('callCenter.row.stockShortTooltip')}
                    >
                      {t('callCenter.row.stockShort')}
                    </p>
                  )}
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {g.variants.map((v, vi) => (
                      <span
                        key={vi}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-badge px-1.5 py-0.5 text-[10px]',
                          g.unlinked
                            ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                            : 'bg-gray-100 text-gray-600',
                        )}
                      >
                        <span className={cn('font-medium', g.unlinked ? 'text-red-700' : 'text-gray-700')}>
                          {v.label}
                        </span>
                        <span className={g.unlinked ? 'text-red-300' : 'text-gray-400'}>×</span>
                        <span className={cn('font-bold', g.unlinked ? 'text-red-800' : 'text-gray-800')}>
                          {v.quantity}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="shrink-0 text-right">
            <p
              className={cn(
                'text-sm font-bold leading-tight',
                hasUnlinked ? 'text-red-600' : 'text-gray-900',
              )}
            >
              {order.total.toLocaleString('fr-MA')}
            </p>
            <p className={cn('text-[9px] uppercase tracking-wide', hasUnlinked ? 'text-red-400' : 'text-gray-400')}>
              MAD
            </p>
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Status pills */}
        <div
          className="flex flex-col gap-1.5 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <ConfirmationPill
                order={order}
                onOpenModal={() => openOrder(order)}
                onRefresh={onRefresh}
              />
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <ShippingPill order={order} />
              <button
                type="button"
                onClick={() => onOpenLogs(order, 'all')}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-900 active:bg-gray-100 active:text-primary"
                title={t('callCenter.row.history')}
              >
                <History size={12} />
              </button>
            </div>
          </div>
          {order.confirmationNote && (
            <div className="flex items-start gap-1.5 rounded-btn bg-amber-50/70 px-2 py-1 text-[11px] text-amber-800">
              <StickyNote size={11} className="mt-0.5 shrink-0" />
              <p className="line-clamp-2">{order.confirmationNote}</p>
            </div>
          )}
          {order.shippingInstruction && (
            <div className="flex items-start gap-1.5 rounded-btn bg-blue-50/70 px-2 py-1 text-[11px] text-blue-800">
              <Truck size={11} className="mt-0.5 shrink-0" />
              <p className="line-clamp-2">{order.shippingInstruction}</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Desktop grid (md and up) ─────────────────────────── */}
      <div
        className="hidden cursor-pointer md:grid md:grid-cols-[120px_minmax(180px,1fr)_minmax(160px,1fr)_100px_minmax(240px,auto)_36px] md:items-center md:gap-3"
        onClick={() => openOrder(order)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') openOrder(order);
        }}
      >
        {/* Ref */}
        <div className="flex items-center gap-2 min-w-0">
          <OrderSourceIcon source={order.source} size={18} />
          <div className="min-w-0">
            <p className="truncate font-mono text-[11px] font-semibold text-gray-800">
              <span className="text-gray-400">{prefix}</span>{seq}
            </p>
            <p className="text-[9px] text-gray-400">{date} · {time}</p>
          </div>
        </div>

        {/* Customer */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCustomer(order.customer.id);
                }}
                className="truncate text-left text-sm font-semibold text-gray-900 hover:text-primary hover:underline"
                title={t('callCenter.row.viewClientHistory')}
              >
                {order.customer.fullName}
              </button>
              <CustomerOrdersBadge count={order.customer._count?.orders} />
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="font-mono">{order.customer.phoneDisplay}</span>
              <a
                href={`tel:${phoneDigits}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-primary hover:bg-primary/10"
                title={t('callCenter.row.call')}
              >
                <Phone size={10} />
              </a>
              <button
                type="button"
                onClick={copyPhone}
                className={cn(
                  'inline-flex h-4 w-4 items-center justify-center rounded-full transition',
                  phoneCopied
                    ? 'bg-emerald-500 text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
                )}
                title={phoneCopied ? t('callCenter.row.copied') : t('callCenter.row.copyPhone')}
              >
                {phoneCopied ? <Check size={10} /> : <Copy size={10} />}
              </button>
              <span className="truncate text-gray-400">· {order.customer.city}</span>
            </div>
          </div>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm transition hover:from-emerald-600 hover:to-emerald-700 hover:shadow-md"
            title={t('callCenter.row.openWhatsapp')}
          >
            <MessageCircle size={16} strokeWidth={2.2} />
          </a>
        </div>

        {/* Product — grouped by product name, one line of variant chips each */}
        <div className="min-w-0 flex items-start gap-2">
          <div className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-accent/60">
            <Package size={14} className="text-primary" />
            {totalItems > 1 && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {totalItems}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            {groups.length === 0 ? (
              <p className="truncate text-sm font-medium text-gray-400">—</p>
            ) : (
              groups.map((g, gi) => (
                <div key={gi} className="min-w-0">
                  <p
                    className={cn(
                      'truncate text-[13px] font-medium leading-tight',
                      g.unlinked ? 'text-red-600' : 'text-gray-800',
                    )}
                    title={
                      g.isDeleted
                        ? t('callCenter.row.deletedProductTooltip')
                        : g.unlinked
                          ? t('callCenter.row.unlinkedProductTooltip')
                          : undefined
                    }
                  >
                    {g.name}
                  </p>
                  {gi === 0 && order.hasStockWarning && order.confirmationStatus === 'pending' && (
                    <p
                      className="text-[10px] font-medium leading-tight text-amber-600"
                      title={t('callCenter.row.stockShortTooltip')}
                    >
                      {t('callCenter.row.stockShort')}
                    </p>
                  )}
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {g.variants.map((v, vi) => (
                      <span
                        key={vi}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-badge px-1.5 py-0.5 text-[10px]',
                          g.unlinked
                            ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                            : 'bg-gray-100 text-gray-600',
                        )}
                      >
                        <span className={cn('font-medium', g.unlinked ? 'text-red-700' : 'text-gray-700')}>
                          {v.label}
                        </span>
                        <span className={g.unlinked ? 'text-red-300' : 'text-gray-400'}>×</span>
                        <span className={cn('font-bold', g.unlinked ? 'text-red-800' : 'text-gray-800')}>
                          {v.quantity}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Price */}
        <div className="text-right">
          <p
            className={cn(
              'text-sm font-bold',
              hasUnlinked ? 'text-red-600' : 'text-gray-900',
            )}
            title={hasUnlinked ? t('callCenter.row.unlinkedTooltip') : undefined}
          >
            {order.total.toLocaleString('fr-MA')}
          </p>
          <p className={cn('text-[10px]', hasUnlinked ? 'text-red-400' : 'text-gray-400')}>MAD</p>
        </div>

        {/* Status pills + notes */}
        <div
          className="flex flex-col gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <ConfirmationPill
              order={order}
              onOpenModal={() => openOrder(order)}
              onRefresh={onRefresh}
            />
            <ShippingPill order={order} />
            <button
              type="button"
              onClick={() => onOpenLogs(order, 'all')}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-900 hover:bg-gray-100 hover:text-primary"
              title={t('callCenter.row.history')}
            >
              <History size={11} />
            </button>
          </div>
          {order.confirmationNote && (
            <div className="flex items-start gap-1 rounded-btn bg-amber-50/70 px-1.5 py-0.5 text-[10px] text-amber-800">
              <StickyNote size={9} className="mt-0.5 shrink-0" />
              <p className="line-clamp-1">{order.confirmationNote}</p>
            </div>
          )}
          {order.shippingInstruction && (
            <div className="flex items-start gap-1 rounded-btn bg-blue-50/70 px-1.5 py-0.5 text-[10px] text-blue-800">
              <Truck size={9} className="mt-0.5 shrink-0" />
              <p className="line-clamp-1">{order.shippingInstruction}</p>
            </div>
          )}
        </div>

        {/* Action */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openOrder(order);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-btn bg-primary text-white transition hover:bg-primary-dark"
            title={t('callCenter.row.openActionPanel')}
          >
            <Send size={13} />
          </button>
        </div>
      </div>

    </div>
  );
}

// ─── Filter pill row ─────────────────────────────────────────────────────────

type SectionKey = 'confirmation' | 'shipping';

interface FilterPillsProps {
  section: SectionKey;
  orders: Order[];
  selected: string | null;
  onChange: (status: string | null) => void;
}

function FilterPills({ section, orders, selected, onChange }: FilterPillsProps) {
  const { t } = useTranslation();
  const colors = section === 'confirmation' ? CONFIRMATION_STATUS_COLORS : SHIPPING_STATUS_COLORS;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      // Shipping pillar keys are now Coliix's literal wordings — what the
      // mapping system buckets them into. Confirmation pillar still uses
      // the internal enum (not Coliix-driven).
      const key =
        section === 'confirmation' ? o.confirmationStatus : o.shippingStatus;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [orders, section]);

  // Count callbacks that need a call today (scheduled for today OR overdue from
  // earlier). Shown as a secondary badge on the Callback pill so agents know
  // how many calls are waiting before they even click the filter.
  const callbackTodayCount = useMemo(() => {
    if (section !== 'confirmation') return 0;
    return orders.reduce(
      (n, o) => (isCallbackToday(o) || isCallbackOverdue(o) ? n + 1 : n),
      0,
    );
  }, [orders, section]);

  // Confirmation walks the enum via `colors` for stable ordering. Shipping
  // walks the live counts map (= shipping enum buckets currently present).
  const visibleStatusKeys = useMemo(() => {
    if (section === 'confirmation') {
      return Object.keys(colors).filter((k) => (counts.get(k) ?? 0) > 0);
    }
    return Array.from(counts.keys()).filter((k) => (counts.get(k) ?? 0) > 0);
  }, [section, colors, counts]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-[11px] font-semibold transition',
          selected === null
            ? 'bg-primary text-white shadow-sm'
            : 'bg-white/70 text-gray-600 hover:bg-white',
        )}
      >
        {t('callCenter.all')}
        <span className="rounded-full bg-black/10 px-1.5 text-[10px] font-bold">
          {orders.length}
        </span>
      </button>
      {visibleStatusKeys.map((status) => {
        const count = counts.get(status) ?? 0;
        if (count === 0) return null;
        const active = selected === status;
        const showTodayBadge = status === 'callback' && callbackTodayCount > 0;
        const cfg = getStatusConfig(status, section);
        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(active ? null : status)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-[11px] font-semibold transition',
              active
                ? cn(cfg.bg, cfg.text, 'ring-2 ring-primary/40 shadow-sm')
                : cn(cfg.bg, cfg.text, 'opacity-70 hover:opacity-100'),
            )}
            title={showTodayBadge ? t('callCenter.toCallToday', { count: callbackTodayCount }) : undefined}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
            <span className="rounded-full bg-white/60 px-1.5 text-[10px] font-bold">
              {count}
            </span>
            {showTodayBadge && (
              <span className="callback-today-blink inline-flex items-center gap-0.5 rounded-full bg-sky-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                <Phone size={8} /> {t('callCenter.todayBadge', { count: callbackTodayCount })}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function CallCenterTable({ onCreate }: { onCreate?: () => void } = {}) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const refreshKey = useCallCenterStore((s) => s.refreshKey);
  const triggerRefresh = useCallCenterStore((s) => s.triggerRefresh);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsOrder, setLogsOrder] = useState<{ order: Order; type: 'all' | 'confirmation' | 'shipping' } | null>(null);
  const [historyCustomerId, setHistoryCustomerId] = useState<string | null>(null);
  // Tab + status filter live in the zustand store so the KPI pipeline chips
  // can drive them from outside this component.
  const activeTab = useCallCenterStore((s) => s.activeTab);
  const setActiveTab = useCallCenterStore((s) => s.setActiveTab);
  const confirmationFilter = useCallCenterStore((s) => s.confirmationFilter);
  const setConfirmationFilter = useCallCenterStore((s) => s.setConfirmationFilter);
  const shippingFilter = useCallCenterStore((s) => s.shippingFilter);
  const setShippingFilter = useCallCenterStore((s) => s.setShippingFilter);
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await ordersApi.list({
        agentIds: user.id,
        page: 1,
        pageSize: 200,
      });
      setOrders(res.data);
    } catch (err) {
      console.error('[CallCenter] Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, refreshKey]);

  // Live updates — surgical patches so open modals / popups / scroll /
  // selection survive when another agent edits a different order. See the
  // matching comment in useOrders.ts for the full reasoning.
  useEffect(() => {
    try {
      const socket = getSocket();

      const patchOne = async (payload: unknown) => {
        const orderId = (payload as { orderId?: string })?.orderId;
        if (!orderId) return;
        try {
          const fresh = await ordersApi.getById(orderId);
          setOrders((prev) => {
            const idx = prev.findIndex((o) => o.id === orderId);
            if (idx === -1) return prev;
            const next = prev.slice();
            next[idx] = { ...next[idx], ...fresh };
            return next;
          });
        } catch {
          setOrders((prev) => prev.filter((o) => o.id !== orderId));
        }
      };

      const dropOne = (payload: unknown) => {
        const orderId = (payload as { orderId?: string })?.orderId;
        if (!orderId) return;
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      };

      const fullRefresh = () => fetchOrders();

      socket.on('order:updated', patchOne);
      socket.on('order:assigned', patchOne);
      socket.on('order:stock_warning', patchOne);
      socket.on('order:archived', dropOne);
      socket.on('order:created', fullRefresh);
      socket.on('order:bulk_updated', fullRefresh);
      // Recovery on (re)connect after a token refresh / network blip — any
      // emit that fired while the socket was disconnected lands in the void.
      socket.on('connect', fullRefresh);

      return () => {
        socket.off('order:updated', patchOne);
        socket.off('order:assigned', patchOne);
        socket.off('order:stock_warning', patchOne);
        socket.off('order:archived', dropOne);
        socket.off('order:created', fullRefresh);
        socket.off('order:bulk_updated', fullRefresh);
        socket.off('connect', fullRefresh);
      };
    } catch {
      // socket not ready
    }
  }, [fetchOrders]);

  // Rerender on clock tick so callback pulse activates when due time passes
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Free-text search across reference, customer name, phone, city, and
  // tracking id. Applied before the pipeline split so the tab counts and
  // status pills reflect what the agent is actively looking at.
  const searchedOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const fields = [
        o.reference,
        o.customer.fullName,
        o.customer.phoneDisplay,
        o.customer.city,
      ];
      return fields.some((f) => f.toLowerCase().includes(q));
    });
  }, [orders, search]);

  // Pipeline split:
  //   - Confirmation tab: orders the call center is still resolving
  //     (pending, callback, unreachable, out_of_stock, cancelled, …).
  //   - Shipping tab: orders that need shipping action OR are already
  //     in flight. Confirmed-but-not-yet-pushed orders ("ready-to-ship")
  //     surface here under the synthetic 'Not Shipped' bucket so the
  //     operator sees the pile alongside the in-flight ones, exactly
  //     as requested.
  // Once an order is pushed to Coliix (labelSent=true) it stays in
  // Shipping regardless of later confirmation-status changes.
  const confirmationOrders = useMemo(
    () =>
      searchedOrders.filter(
        (o) => o.confirmationStatus !== 'confirmed' && !o.labelSent,
      ),
    [searchedOrders],
  );
  const shippingOrders = useMemo(
    () =>
      searchedOrders.filter(
        (o) => o.labelSent || o.confirmationStatus === 'confirmed',
      ),
    [searchedOrders],
  );

  const filteredConfirmation = useMemo(
    () =>
      confirmationFilter
        ? confirmationOrders.filter((o) => o.confirmationStatus === confirmationFilter)
        : confirmationOrders,
    [confirmationOrders, confirmationFilter],
  );

  const filteredShipping = useMemo(
    () =>
      shippingFilter
        ? shippingOrders.filter((o) => o.shippingStatus === shippingFilter)
        : shippingOrders,
    [shippingOrders, shippingFilter],
  );

  if (loading) {
    return (
      <GlassCard padding="md" className="flex min-h-[200px] items-center justify-center">
        <span className="text-sm text-gray-400">{t('callCenter.loadingPipeline')}</span>
      </GlassCard>
    );
  }

  if (orders.length === 0) {
    return (
      <GlassCard padding="md" className="flex min-h-[200px] flex-col items-center justify-center gap-3">
        <Package size={28} className="text-gray-300" />
        <p className="text-sm font-semibold text-gray-500">{t('callCenter.noOrdersAssigned')}</p>
        <p className="text-xs text-gray-400">{t('callCenter.newOrdersAppear')}</p>
        {onCreate && (
          <CRMButton
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={onCreate}
            className="mt-1"
          >
            {t('callCenter.newOrder')}
          </CRMButton>
        )}
      </GlassCard>
    );
  }

  const visible = activeTab === 'confirmation' ? filteredConfirmation : filteredShipping;
  const tabOrders = activeTab === 'confirmation' ? confirmationOrders : shippingOrders;
  const selectedFilter = activeTab === 'confirmation' ? confirmationFilter : shippingFilter;
  const setSelectedFilter = activeTab === 'confirmation' ? setConfirmationFilter : setShippingFilter;
  const tabCounts: Record<SectionKey, number> = {
    confirmation: confirmationOrders.length,
    shipping: shippingOrders.length,
  };

  return (
    <div id="call-center-pipeline" className="flex flex-col gap-4 scroll-mt-4">
      <GlassCard padding="sm" className="flex flex-col gap-3">
        {/* Search bar */}
        <div className="flex h-9 items-center gap-2 rounded-input border border-gray-200 bg-white px-3 focus-within:border-primary">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('callCenter.searchPlaceholder')}
            className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder-gray-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-gray-400 hover:text-gray-600"
              aria-label={t('callCenter.clearSearch')}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Horizontal section tabs */}
        <div className="flex items-center gap-1 rounded-input border border-gray-200 bg-gray-50 p-1 self-start">
          {(['confirmation', 'shipping'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={cn(
                'rounded-btn px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition',
                activeTab === key
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {key === 'confirmation' ? t('callCenter.tabConfirmation') : t('callCenter.tabShipping')}
              <span
                className={cn(
                  'ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  activeTab === key
                    ? 'bg-primary/10 text-primary'
                    : 'bg-gray-200 text-gray-500',
                )}
              >
                {tabCounts[key]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterPills
            section={activeTab}
            orders={tabOrders}
            selected={selectedFilter}
            onChange={setSelectedFilter}
          />
          {onCreate && (
            <CRMButton
              variant="primary"
              leftIcon={<Plus size={14} />}
              onClick={onCreate}
              className="w-full shrink-0 sm:w-auto"
            >
              {t('callCenter.newOrder')}
            </CRMButton>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">
            {activeTab === 'shipping' && shippingOrders.length === 0
              ? t('callCenter.noShippingYet')
              : t('callCenter.noOrdersMatch')}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 md:gap-1.5">
            {visible.map((o) => (
              <Row
                key={o.id}
                order={o}
                onOpenLogs={(order, type) => setLogsOrder({ order, type })}
                onOpenCustomer={setHistoryCustomerId}
                onRefresh={triggerRefresh}
              />
            ))}
          </div>
        )}
      </GlassCard>

      {logsOrder && (
        <OrderLogsModal
          orderId={logsOrder.order.id}
          orderReference={logsOrder.order.reference}
          defaultFilter={logsOrder.type}
          onClose={() => setLogsOrder(null)}
        />
      )}

      <CustomerHistoryModal
        customerId={historyCustomerId}
        onClose={() => setHistoryCustomerId(null)}
      />
    </div>
  );
}
