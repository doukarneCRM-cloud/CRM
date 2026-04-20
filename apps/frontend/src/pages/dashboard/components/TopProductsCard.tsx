import { Package } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import type { DashboardTopProduct } from '@/services/dashboardApi';

interface Props {
  products: DashboardTopProduct[];
  loading: boolean;
}

export function TopProductsCard({ products, loading }: Props) {
  const max = Math.max(1, ...products.map((p) => p.orders));

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Top Products</h3>
        <p className="text-[11px] text-gray-400">By order volume</p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          No product sales
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((p, i) => {
            const width = (p.orders / max) * 100;
            return (
              <li
                key={p.productId}
                className="flex items-center gap-3 rounded-card border border-gray-100 bg-white/60 px-3 py-2"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  #{i + 1}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Package size={11} className="shrink-0 text-gray-400" />
                      <span className="truncate text-xs font-medium text-gray-900">
                        {p.productName}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-gray-700">
                      {p.orders}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {p.revenue.toLocaleString('fr-MA')} MAD delivered
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
