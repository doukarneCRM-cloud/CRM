import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle2, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { productionApi, type ProductionRun } from '@/services/productionApi';
import { getSocket } from '@/services/socket';

export default function ProductionDashboardPage() {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    return productionApi
      .listRuns()
      .then(setRuns)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live: when a stage transition fires (`production:stage`) the cost +
  // status counters need to refresh. Refetch is fine — the runs list is
  // small and the event is rare. Also bind to `production:run:updated`
  // (currently emitted nowhere — hook left in for the new emit added
  // alongside this; safe no-op until then).
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }
    const handler = () => {
      void load();
    };
    socket.on('production:stage', handler);
    socket.on('production:run:updated', handler);
    return () => {
      socket?.off('production:stage', handler);
      socket?.off('production:run:updated', handler);
    };
  }, [load]);

  const active = runs.filter((r) => r.status === 'active');
  const draft = runs.filter((r) => r.status === 'draft');
  const weekCost = runs
    .filter((r) => {
      const d = new Date(r.startDate);
      const now = new Date();
      const ago = new Date();
      ago.setDate(now.getDate() - 7);
      return d >= ago;
    })
    .reduce((s, r) => s + r.totalCost, 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('production.dashboard.title')}</h1>
          <p className="text-xs text-gray-400">{t('production.dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={ROUTES.PRODUCTION_TESTS}
            className="rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('production.dashboard.productTestsLink')}
          </Link>
          <Link
            to={ROUTES.PRODUCTION_RUNS}
            className="rounded-btn bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            {t('production.dashboard.productionRunsLink')}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GlassCard padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-emerald-100 text-emerald-600">
              <Activity size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-400">{t('production.dashboard.activeRuns')}</p>
              <p className="text-xl font-bold text-gray-900">{active.length}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-amber-100 text-amber-600">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-400">{t('production.dashboard.draftRuns')}</p>
              <p className="text-xl font-bold text-gray-900">{draft.length}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard padding="md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-indigo-100 text-indigo-600">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-400">{t('production.dashboard.spentLast7d')}</p>
              <p className="text-xl font-bold text-gray-900">
                {t('production.dashboard.valueMad', { value: weekCost.toFixed(0) })}
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard padding="md" className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            {t('production.dashboard.recentRuns')}
          </h2>
          <Link
            to={ROUTES.PRODUCTION_RUNS}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {t('production.dashboard.viewAll')}
          </Link>
        </div>
        {loading ? (
          <p className="py-4 text-center text-sm text-gray-400">
            {t('production.dashboard.loading')}
          </p>
        ) : runs.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            {t('production.dashboard.emptyRuns')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium">{t('production.dashboard.col.ref')}</th>
                <th className="py-2 text-left font-medium">
                  {t('production.dashboard.col.status')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.dashboard.col.started')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.dashboard.col.pieces')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.dashboard.col.costPerPiece')}
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 10).map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <Link
                      to={ROUTES.PRODUCTION_RUN_DETAIL.replace(':id', r.id)}
                      className="font-semibold text-primary hover:underline"
                    >
                      {r.reference}
                    </Link>
                  </td>
                  <td className="py-2 text-gray-600">
                    {t(`production.runs.status.${r.status}`)}
                  </td>
                  <td className="py-2 text-gray-500">
                    {new Date(r.startDate).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-right text-gray-700">
                    {r.actualPieces} / {r.expectedPieces}
                  </td>
                  <td className="py-2 text-right text-gray-900">
                    {r.costPerPiece > 0
                      ? t('production.dashboard.valueMad', { value: r.costPerPiece.toFixed(2) })
                      : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
    </div>
  );
}
