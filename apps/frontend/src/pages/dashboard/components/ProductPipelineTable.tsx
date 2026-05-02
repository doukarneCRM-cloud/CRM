import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';
import { resolveImageUrl } from '@/lib/imageUrl';

const EVENTS = ['order:created', 'order:confirmed', 'order:delivered', 'order:archived'];

export function ProductPipelineTable() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.pipelineProducts(20, filters),
    EVENTS,
    filters,
  );
  const rows = data ?? [];

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <h3 className="text-base font-bold text-gray-900">{t('dashboard.pipeline.productsTitle')}</h3>
      {loading ? (
        <div className="skeleton h-32 w-full rounded-md" />
      ) : rows.length === 0 ? (
        <div className="rounded-md bg-gray-50 px-3 py-6 text-center text-xs italic text-gray-400">
          {t('dashboard.pipeline.noProducts')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                <th className="pb-2 pr-3 font-semibold">{t('dashboard.pipeline.product')}</th>
                <th className="pb-2 pr-3 font-semibold text-right">
                  {t('dashboard.pipeline.orders')}
                </th>
                <th className="pb-2 pr-3 font-semibold text-right">
                  {t('dashboard.pipeline.confirmed')}
                </th>
                <th className="pb-2 pr-3 font-semibold text-right">
                  {t('dashboard.pipeline.delivered')}
                </th>
                <th className="pb-2 pr-3 font-semibold text-right">
                  {t('dashboard.pipeline.confirmRate')}
                </th>
                <th className="pb-2 font-semibold text-right">
                  {t('dashboard.pipeline.deliverRate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-t border-gray-100">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      {r.imageUrl ? (
                        <img
                          src={resolveImageUrl(r.imageUrl) ?? ''}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-7 w-7 shrink-0 rounded bg-gray-100" />
                      )}
                      <span className="truncate font-semibold text-gray-800">{r.name}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right font-bold text-gray-900">{r.orders}</td>
                  <td className="py-2 pr-3 text-right text-gray-700">{r.confirmed}</td>
                  <td className="py-2 pr-3 text-right text-gray-700">{r.delivered}</td>
                  <td className="py-2 pr-3 text-right">
                    <span className="text-gray-600">{r.confirmationRate.toFixed(1)}%</span>
                  </td>
                  <td className="py-2 text-right">
                    <span className="text-gray-600">{r.deliveryRate.toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
