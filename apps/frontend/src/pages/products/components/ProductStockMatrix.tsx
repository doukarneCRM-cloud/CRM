import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { StockCell } from './StockCell';
import { MeasurementTable } from './MeasurementTable';
import { resolveImageUrl } from '@/lib/imageUrl';
import { compareSizes } from '@/lib/sizeOrder';
import type { ProductDetail } from '@/services/productsApi';

interface Props {
  product: ProductDetail;
  canEdit: boolean;
}

// Per-product mini-matrix: rows = distinct colors, columns = distinct sizes,
// cells = stock for that combination. Variants missing a combination render
// as a dashed placeholder so the grid stays aligned.
export function ProductStockMatrix({ product, canEdit }: Props) {
  const { t } = useTranslation();
  const { colors, sizes, variantMap } = useMemo(() => {
    const colorSet = new Set<string>();
    const sizeSet = new Set<string>();
    const map = new Map<string, ProductDetail['variants'][number]>();
    for (const v of product.variants) {
      const color = v.color ?? '';
      const size = v.size ?? '';
      colorSet.add(color);
      sizeSet.add(size);
      map.set(`${color}::${size}`, v);
    }
    const sortColorsEmptyLast = (a: string, b: string) => {
      if (a === '' && b !== '') return 1;
      if (b === '' && a !== '') return -1;
      return a.localeCompare(b);
    };
    return {
      colors: [...colorSet].sort(sortColorsEmptyLast),
      // Sizes use the canonical CRM ordering (M / L / XL / XXL first,
      // then S / XS / XXS, then XXXL+, then numeric / measured sizes,
      // empty strings last). Same util used by every matrix view in
      // the app so column order stays consistent.
      sizes: [...sizeSet].sort(compareSizes),
      variantMap: map,
    };
  }, [product.variants]);

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-gray-100 bg-white/70 md:flex-row">
      {/* ── Left: product identity ──────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col items-start gap-2 border-b border-gray-100 bg-accent/30 p-4 md:w-[220px] md:border-b-0 md:border-r">
        <div className="aspect-square w-full overflow-hidden rounded-card border border-gray-100 bg-gradient-to-br from-gray-50 to-white">
          {product.imageUrl ? (
            <img
              src={resolveImageUrl(product.imageUrl)}
              alt={product.name}
              className="h-full w-full object-contain p-2"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300">
              <Package size={28} />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-wide text-gray-400">
            {product.sku}
          </p>
          <p className="text-xs text-gray-500">
            {t('products.stockMatrix.baseLabel')} <span className="font-semibold text-primary">{product.basePrice.toLocaleString('fr-MA')} MAD</span>
          </p>
        </div>
      </div>

      {/* ── Right: title + matrix + measurements ────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <h3 className="truncate text-sm font-semibold text-gray-900">{product.name}</h3>
          <span className="shrink-0 rounded-badge bg-accent px-2 py-0.5 text-[10px] font-semibold text-primary">
            {t('products.stockMatrix.variantCount', { count: product.variants.length })}
          </span>
        </div>

        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-start lg:gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {t('products.stockMatrix.colorSize')}
                </th>
                {sizes.map((s) => (
                  <th
                    key={s || 'no-size'}
                    className="min-w-[96px] px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {s || '—'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {colors.map((c, rowIdx) => (
                <tr
                  key={c || 'no-color'}
                  className={rowIdx % 2 === 0 ? 'bg-transparent' : 'bg-accent/20'}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
                    {c || '—'}
                  </td>
                  {sizes.map((s) => {
                    const v = variantMap.get(`${c}::${s}`);
                    return (
                      <td key={s || 'no-size'} className="px-2 py-1.5">
                        {v ? (
                          <StockCell
                            productId={product.id}
                            variantId={v.id}
                            stock={v.stock}
                            canEdit={canEdit}
                          />
                        ) : (
                          <div className="flex h-11 w-full items-center justify-center rounded-input border border-dashed border-gray-200 text-[11px] text-gray-300">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

          {product.measurements && product.measurements.columns.length > 0 ? (
            <MeasurementTable
              data={product.measurements}
              compact
              className="w-full shrink-0 lg:w-[260px]"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
