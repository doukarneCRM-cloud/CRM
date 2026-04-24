import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Pencil, Trash2, Loader2, Ruler } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { cn } from '@/lib/cn';
import { resolveImageUrl } from '@/lib/imageUrl';
import type { ProductDetail } from '@/services/productsApi';
import { MeasurementTable } from './MeasurementTable';

interface Props {
  product: ProductDetail;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
}

function stockTone(stock: number) {
  if (stock === 0) return 'bg-red-50 text-red-600 border-red-200';
  if (stock <= 5) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export function ProductCard({ product, canEdit, canDelete, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const totalStock = product.variants.reduce((s, v) => s + v.stock, 0);
  const hasMeasurements =
    !!product.measurements &&
    product.measurements.columns.length > 0 &&
    product.measurements.rows.length > 0;
  const [deleting, setDeleting] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);

  const handleDelete = async () => {
    const ok = window.confirm(t('products.card.deleteConfirm', { name: product.name }));
    if (!ok) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-3 overflow-hidden p-0">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
        {product.imageUrl ? (
          <img
            src={resolveImageUrl(product.imageUrl)}
            alt={product.name}
            className="h-full w-full object-contain p-3 transition-transform duration-200 hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            <Package size={32} />
          </div>
        )}

        {product.isActive === false && (
          <span className="absolute left-2 top-2 rounded-badge bg-gray-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {t('products.card.inactive')}
          </span>
        )}

        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-500 shadow-sm transition-colors hover:bg-white hover:text-red-600 disabled:opacity-60"
              aria-label={t('products.card.deleteProduct')}
              title={t('products.card.deleteProduct')}
            >
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-primary shadow-sm transition-colors hover:bg-white"
              aria-label={t('products.card.editProduct')}
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900">{product.name}</h3>
            <p className="truncate font-mono text-[10px] text-gray-400">{product.sku}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('products.card.base')}</p>
            <p className="text-sm font-bold text-primary">
              {product.basePrice.toLocaleString('fr-MA')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {product.variants.slice(0, 6).map((v) => (
            <span
              key={v.id}
              className={cn(
                'rounded-badge border px-1.5 py-0.5 text-[10px] font-medium',
                stockTone(v.stock),
              )}
              title={`${v.color ?? '—'} · ${v.size ?? '—'} — ${t('products.card.inStock', { count: v.stock })}`}
            >
              {[v.color, v.size].filter(Boolean).join(' · ') || v.sku}
              <span className="ml-1 font-bold">({v.stock})</span>
            </span>
          ))}
          {product.variants.length > 6 && (
            <span className="rounded-badge border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              +{product.variants.length - 6}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-[11px]">
          <span className="text-gray-400">
            {t('products.card.variantCount', { count: product.variants.length })}
          </span>
          <span className={cn('font-semibold', totalStock === 0 ? 'text-red-500' : 'text-gray-700')}>
            {t('products.card.inStock', { count: totalStock })}
          </span>
        </div>

        {hasMeasurements && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowMeasurements((v) => !v)}
              className="flex items-center justify-between gap-2 rounded-input border border-gray-100 bg-accent/30 px-2 py-1 text-[11px] font-semibold text-gray-700 transition-colors hover:border-primary/30 hover:bg-accent/60 hover:text-primary"
            >
              <span className="flex items-center gap-1.5">
                <Ruler size={11} className="text-primary" />
                {t('products.card.measurements')}
              </span>
              <span className="text-[10px] font-medium text-gray-400">
                {showMeasurements ? t('products.card.hide') : t('products.card.show')}
              </span>
            </button>
            {showMeasurements && <MeasurementTable data={product.measurements} compact />}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
