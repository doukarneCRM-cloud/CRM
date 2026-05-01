import { useTranslation } from 'react-i18next';
import {
  User,
  MapPin,
  Phone,
  MessageCircle,
  Package,
  Tag,
  Hash,
  Clock,
  PhoneOff,
  AlertTriangle,
  Archive,
  Edit2,
} from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OrderSourceIcon } from '@/components/ui/OrderSourceIcon';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRef, formatDate } from '@/lib/orderFormat';
import type { Order } from '@/types/orders';
import { cn } from '@/lib/cn';

interface OrderPreviewModalProps {
  order: Order | null;
  onClose: () => void;
  onEdit?: (order: Order) => void;
}

// ─── Tiny presentational primitives ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </h3>
      <div className="rounded-xl border border-gray-100 bg-white/60 p-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 truncate text-sm',
          mono && 'font-mono',
          highlight ? 'font-semibold text-gray-900' : 'text-gray-700',
        )}
        title={typeof value === 'string' ? value : undefined}
      >
        {value || '—'}
      </span>
    </div>
  );
}

function customerTagBadge(tag: Order['customer']['tag'], t: (k: string) => string) {
  const map = {
    vip: { label: t('orders.preview.tagVip'), className: 'bg-amber-50 text-amber-700 ring-amber-200' },
    blacklisted: { label: t('orders.preview.tagBlacklisted'), className: 'bg-red-50 text-red-700 ring-red-200' },
    normal: { label: t('orders.preview.tagNormal'), className: 'bg-gray-50 text-gray-600 ring-gray-200' },
  } as const;
  const cfg = map[tag] ?? map.normal;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[10px] font-semibold ring-1',
        cfg.className,
      )}
    >
      <Tag size={10} /> {cfg.label}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function OrderPreviewModal({ order, onClose, onEdit }: OrderPreviewModalProps) {
  const { t } = useTranslation();

  if (!order) return null;

  const { prefix, seq } = formatRef(order.reference);
  const created = formatDate(order.createdAt);
  const updated = formatDate(order.updatedAt);
  const callback = order.callbackAt ? formatDate(order.callbackAt) : null;
  const waLink = `https://wa.me/${order.customer.phoneDisplay.replace(/^0/, '212')}`;

  const subtotal = order.subtotal;
  const shipping = order.shippingPrice;
  const discount = order.discountAmount ?? 0;
  const total = order.total;

  const title = (
    <div className="flex items-center gap-2">
      <span className="font-mono text-base font-semibold text-gray-900">
        <span className="text-gray-400">{prefix}</span>
        {seq}
      </span>
      <OrderSourceIcon source={order.source} size={14} />
      {order.isArchived && (
        <span className="inline-flex items-center gap-1 rounded-badge bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200">
          <Archive size={10} /> {t('orders.preview.archived')}
        </span>
      )}
    </div>
  );

  return (
    <GlassModal
      open={!!order}
      onClose={onClose}
      size="3xl"
      title={t('orders.preview.title')}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">
            {t('orders.preview.created')} {created.date} · {created.time}
            {' · '}
            {t('orders.preview.updated')} {updated.date} · {updated.time}
          </span>
          <div className="flex items-center gap-2">
            <CRMButton variant="secondary" size="sm" onClick={onClose}>
              {t('shared.modal.close')}
            </CRMButton>
            {onEdit && (
              <CRMButton
                variant="primary"
                size="sm"
                leftIcon={<Edit2 size={13} />}
                onClick={() => onEdit(order)}
              >
                {t('orders.editOrder')}
              </CRMButton>
            )}
          </div>
        </div>
      }
    >
      {/* ── Top summary strip ─────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white/70 p-3">
        {title}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold uppercase text-gray-300">C</span>
            <StatusBadge status={order.confirmationStatus} size="sm" showDot />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold uppercase text-gray-300">S</span>
            <StatusBadge status={order.shippingStatus} type="shipping" size="sm" showDot />
          </div>
        </div>
      </div>

      {/* ── Customer ─────────────────────────────────────────────────────── */}
      <Section title={t('orders.preview.customer')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={t('orders.preview.fullName')}
            value={
              <span className="inline-flex items-center gap-2">
                {order.customer.fullName}
                {customerTagBadge(order.customer.tag, t)}
              </span>
            }
            highlight
          />
          <Field
            label={t('orders.preview.phone')}
            value={
              <span className="inline-flex items-center gap-2">
                <Phone size={11} className="text-gray-400" />
                <span className="font-mono">{order.customer.phoneDisplay}</span>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-green-600 hover:bg-green-50"
                  title={t('orders.whatsapp')}
                >
                  <MessageCircle size={11} />
                </a>
              </span>
            }
            mono
          />
          <Field
            label={t('orders.preview.city')}
            value={
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} className="text-gray-400" />
                {order.customer.city}
              </span>
            }
          />
          <Field
            label={t('orders.preview.address')}
            value={order.customer.address ?? '—'}
          />
          {typeof order.customer._count?.orders === 'number' && (
            <Field
              label={t('orders.preview.totalOrders')}
              value={order.customer._count.orders}
            />
          )}
        </div>
      </Section>

      {/* ── Agent ────────────────────────────────────────────────────────── */}
      <Section title={t('orders.preview.agent')}>
        {order.agent ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              label={t('orders.preview.name')}
              value={
                <span className="inline-flex items-center gap-1.5">
                  <User size={11} className="text-gray-400" />
                  {order.agent.name}
                </span>
              }
              highlight
            />
            <Field label={t('orders.preview.role')} value={order.agent.role?.label ?? order.agent.role?.name ?? '—'} />
            <Field label={t('orders.preview.email')} value={order.agent.email ?? '—'} />
          </div>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            {t('orders.unassigned')}
          </p>
        )}
      </Section>

      {/* ── Items ────────────────────────────────────────────────────────── */}
      <Section title={t('orders.preview.items')}>
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => {
            const img = resolveImageUrl(item.variant.product.imageUrl);
            const isPlaceholder = Boolean(item.variant.product.isPlaceholder);
            const isDeleted = Boolean(item.variant.product.deletedAt);
            const flagged = isPlaceholder || isDeleted;
            return (
              <li
                key={item.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-2',
                  flagged ? 'border-red-100 bg-red-50/40' : 'border-gray-100 bg-white',
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                  {img ? (
                    <img src={img} alt={item.variant.product.name} className="h-full w-full object-cover" />
                  ) : (
                    <Package size={16} className="text-gray-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-sm font-semibold',
                      flagged ? 'text-red-600' : 'text-gray-800',
                    )}
                    title={item.variant.product.name}
                  >
                    {item.variant.product.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {item.variant.color && (
                      <span className="rounded-badge bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {item.variant.color}
                      </span>
                    )}
                    {item.variant.size && (
                      <span className="rounded-badge bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {item.variant.size}
                      </span>
                    )}
                    {item.variant.sku && (
                      <span className="font-mono text-[10px] text-gray-400">{item.variant.sku}</span>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <p className="text-gray-500">
                    {item.quantity} × {item.unitPrice.toLocaleString('fr-MA')} MAD
                  </p>
                  <p className="font-semibold text-gray-900">
                    {item.total.toLocaleString('fr-MA')} MAD
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <Section title={t('orders.preview.pricing')}>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">{t('orders.preview.subtotal')}</span>
            <span className="font-mono text-gray-700">{subtotal.toLocaleString('fr-MA')} MAD</span>
          </div>
          {discount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500">
                {t('orders.preview.discount')}
                {order.discountType === 'percentage' && ` (${discount}%)`}
              </span>
              <span className="font-mono text-amber-600">
                −{(order.discountType === 'percentage' ? (subtotal * discount) / 100 : discount).toLocaleString('fr-MA')} MAD
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-gray-500">{t('orders.preview.shipping')}</span>
            <span className="font-mono text-gray-700">{shipping.toLocaleString('fr-MA')} MAD</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-2">
            <span className="font-semibold text-gray-900">{t('orders.preview.total')}</span>
            <span className="font-mono text-base font-bold text-gray-900">
              {total.toLocaleString('fr-MA')} MAD
            </span>
          </div>
        </div>
      </Section>

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      {(order.confirmationNote || order.shippingInstruction || order.cancellationReason) && (
        <Section title={t('orders.preview.notes')}>
          <div className="flex flex-col gap-2 text-sm">
            {order.confirmationNote && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {t('orders.preview.confirmationNote')}
                </p>
                <p className="whitespace-pre-wrap text-gray-700">{order.confirmationNote}</p>
              </div>
            )}
            {order.shippingInstruction && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {t('orders.preview.shippingInstruction')}
                </p>
                <p className="whitespace-pre-wrap text-blue-600">{order.shippingInstruction}</p>
              </div>
            )}
            {order.cancellationReason && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {t('orders.preview.cancellationReason')}
                </p>
                <p className="whitespace-pre-wrap text-red-600">{order.cancellationReason}</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Shipping & meta ──────────────────────────────────────────────── */}
      <Section title={t('orders.preview.shippingAndMeta')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={t('orders.preview.labelSent')}
            value={order.labelSent ? t('orders.preview.yes') : t('orders.preview.no')}
          />
          <Field
            label={t('orders.preview.callbackAt')}
            value={
              callback ? (
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} className="text-gray-400" />
                  {callback.date} · {callback.time}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Field
            label={t('orders.preview.unreachable')}
            value={
              <span className="inline-flex items-center gap-1">
                <PhoneOff size={11} className={order.unreachableCount > 0 ? 'text-amber-600' : 'text-gray-400'} />
                {order.unreachableCount}
              </span>
            }
          />
          <Field
            label={t('orders.preview.source')}
            value={
              <span className="inline-flex items-center gap-1.5">
                <OrderSourceIcon source={order.source} size={12} />
                <span className="capitalize">{order.source}</span>
              </span>
            }
          />
          <Field
            label={t('orders.preview.id')}
            value={
              <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                <Hash size={10} className="text-gray-400" />
                {order.id}
              </span>
            }
          />
          {order.hasStockWarning && (
            <div className="sm:col-span-2">
              <span className="inline-flex items-center gap-1 rounded-badge bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                <AlertTriangle size={11} /> {t('orders.stockShort')}
              </span>
            </div>
          )}
        </div>
      </Section>
    </GlassModal>
  );
}
