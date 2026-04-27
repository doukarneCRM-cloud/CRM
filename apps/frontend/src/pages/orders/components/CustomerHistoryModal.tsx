import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Phone, MapPin, ShoppingBag, ChevronRight, Tag,
} from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { customersApi } from '@/services/ordersApi';
import type { CustomerDetail, Order, Pagination } from '@/types/orders';
import { cn } from '@/lib/cn';
import { formatDateShort } from '@/lib/orderFormat';

const TAG_STYLE = {
  normal: { bg: 'bg-gray-100', text: 'text-gray-600' },
  vip: { bg: 'bg-amber-100', text: 'text-amber-700' },
  blacklisted: { bg: 'bg-red-100', text: 'text-red-700' },
};

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatBox({ label, value, color = 'text-gray-900' }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-gray-50 px-4 py-3 text-center">
      <span className={cn('text-xl font-bold', color)}>{value}</span>
      <span className="mt-0.5 text-[11px] text-gray-400">{label}</span>
    </div>
  );
}

// ─── Order mini-row ───────────────────────────────────────────────────────────

function OrderRow({ order }: { order: Order }) {
  const { t } = useTranslation();
  const firstItem = order.items[0];
  const product = firstItem?.variant?.product?.name ?? '—';
  const color = firstItem?.variant?.color;
  const size = firstItem?.variant?.size;
  // Skip the meaningless "default → default" placeholder YouCan emits for
  // single-variant products so the row doesn't show "Default / Default".
  const isDefault = (s: string | null | undefined) =>
    !!s && s.toLowerCase() === 'default';
  const variationParts = [
    !isDefault(color) ? color : null,
    !isDefault(size) ? size : null,
  ].filter((s): s is string => !!s && s.length > 0);
  const qty = order.items.reduce((s, i) => s + i.quantity, 0);
  const extraItems = order.items.length - 1;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-50 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-gray-700">{order.reference}</span>
          <span className="text-[10px] text-gray-400">{formatDateShort(order.createdAt)}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <span className="truncate">{product}</span>
          {variationParts.map((v) => (
            <span
              key={v}
              className="inline-flex items-center rounded-badge bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-700"
            >
              {v}
            </span>
          ))}
          {qty > 1 && (
            <span className="text-[10px] font-semibold text-gray-500">×{qty}</span>
          )}
          {extraItems > 0 && (
            <span className="text-[10px] text-gray-400">
              +{t('orders.customerHistory.moreItems', { count: extraItems })}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={order.confirmationStatus} size="sm" />
        <span className="text-xs font-semibold text-gray-700">
          {order.total.toLocaleString('fr-MA')} MAD
        </span>
        <ChevronRight size={12} className="text-gray-300" />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CustomerHistoryModalProps {
  customerId: string | null;
  onClose: () => void;
}

export function CustomerHistoryModal({ customerId, onClose }: CustomerHistoryModalProps) {
  const { t } = useTranslation();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const [cust, history] = await Promise.all([
        customersApi.getById(customerId),
        customersApi.history(customerId, page, 10),
      ]);
      setCustomer(cust);
      setOrders(history.data);
      setPagination(history.pagination);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [customerId, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset on close
  useEffect(() => {
    if (!customerId) {
      setCustomer(null);
      setOrders([]);
      setPage(1);
    }
  }, [customerId]);

  const tagConfig = customer ? TAG_STYLE[customer.tag] : TAG_STYLE.normal;
  const tagLabel = customer
    ? t(`orders.customerHistory.tag${customer.tag.charAt(0).toUpperCase()}${customer.tag.slice(1)}` as const)
    : t('orders.customerHistory.tagNormal');

  // Compute quick stats from visible orders (simplified)
  const delivered = orders.filter((o) => o.shippingStatus === 'delivered').length;
  const cancelled = orders.filter((o) => o.confirmationStatus === 'cancelled').length;
  const total = pagination?.total ?? 0;

  return (
    <GlassModal
      open={!!customerId}
      onClose={onClose}
      title={t('orders.customerHistory.title')}
      size="lg"
    >
      {loading && !customer ? (
        <div className="flex flex-col gap-4">
          <div className="skeleton h-6 w-48 rounded" />
          <div className="skeleton h-4 w-32 rounded" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        </div>
      ) : customer ? (
        <>
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">{customer.fullName}</h3>
                <span className={cn('rounded-badge px-2.5 py-0.5 text-[11px] font-semibold', tagConfig.bg, tagConfig.text)}>
                  <Tag size={9} className="mr-1 inline-block" />
                  {tagLabel}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Phone size={11} />
                  {customer.phoneDisplay}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={11} />
                  {customer.city}
                </span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mb-4 grid grid-cols-4 gap-3">
            <StatBox label={t('orders.customerHistory.totalOrders')} value={total} />
            <StatBox label={t('orders.customerHistory.delivered')} value={delivered} color="text-green-600" />
            <StatBox label={t('orders.customerHistory.cancelled')} value={cancelled} color="text-red-600" />
            <StatBox
              label={t('orders.customerHistory.returnRate')}
              value={delivered > 0 ? Math.round((orders.filter((o) => o.shippingStatus === 'returned').length / delivered) * 100) : 0}
              color="text-orange-600"
            />
          </div>

          {/* Orders list */}
          <div className="max-h-72 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                <ShoppingBag size={32} className="mx-auto mb-2 text-gray-200" />
                {t('orders.customerHistory.noOrdersYet')}
              </div>
            ) : (
              <>
                {orders.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
                    >
                      {t('common.previous')}
                    </button>
                    <span className="text-xs text-gray-400">
                      {page} / {pagination.totalPages}
                    </span>
                    <button
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
                    >
                      {t('common.next')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : null}
    </GlassModal>
  );
}
