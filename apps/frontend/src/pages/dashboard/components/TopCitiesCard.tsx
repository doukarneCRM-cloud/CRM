import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import type { DashboardTopCity } from '@/services/dashboardApi';

interface Props {
  cities: DashboardTopCity[];
  loading: boolean;
}

export function TopCitiesCard({ cities, loading }: Props) {
  const { t } = useTranslation();
  const max = Math.max(1, ...cities.map((c) => c.orders));

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.topCities')}</h3>
        <p className="text-[11px] text-gray-400">{t('dashboard.topProductsSub')}</p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : cities.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          {t('dashboard.noCityActivity')}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {cities.map((c, i) => {
            const width = (c.orders / max) * 100;
            return (
              <li
                key={c.city}
                className="flex items-center gap-3 rounded-card border border-gray-100 bg-white/60 px-3 py-2"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  #{i + 1}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <MapPin size={11} className="shrink-0 text-gray-400" />
                      <span className="truncate text-xs font-medium text-gray-900">{c.city}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-gray-700">
                      {c.orders}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {t('dashboard.cityDeliveredRate', { delivered: c.delivered, rate: Math.round(c.deliveryRate) })}
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
