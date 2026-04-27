import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Lock,
  Unlock,
  Loader2,
  Coins,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { GlassCard, CRMButton } from '@/components/ui';
import {
  productionApi,
  type ProductionWeekProjection,
  type LaborAllocationMode,
} from '@/services/productionApi';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';

const MODE_TONE: Record<LaborAllocationMode, string> = {
  by_pieces:    'bg-blue-50 text-blue-700',
  by_complexity: 'bg-violet-50 text-violet-700',
  manual:       'bg-amber-50 text-amber-700',
};

export default function ProductionWeekDetailPage() {
  const { t } = useTranslation();
  const { weekStart } = useParams<{ weekStart: string }>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canClose = hasPermission('production:close_week');
  const pushToast = useToastStore((s) => s.push);

  const [data, setData] = useState<ProductionWeekProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!weekStart) return;
    setLoading(true);
    try {
      const r = await productionApi.getWeek(weekStart);
      setData(r);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  async function close() {
    if (!weekStart) return;
    if (!window.confirm(t('production.weeks.confirmClose'))) return;
    setClosing(true);
    try {
      const r = await productionApi.closeWeek(weekStart);
      setData(r);
      pushToast({
        kind: 'confirmed',
        title: t('production.weeks.toast.closedTitle'),
        body: t('production.weeks.toast.closedBody'),
      });
    } catch (err) {
      pushToast({
        kind: 'error',
        title: t('production.weeks.toast.errorTitle'),
        body: apiErrorMessage(err, t('production.weeks.toast.errorBody')),
      });
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">{t('production.weeks.loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-gray-400">{t('production.weeks.notFound')}</div>;
  }

  const totalShare = data.runs.reduce((s, r) => s + r.share, 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <Link
        to="/production/weeks"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary"
      >
        <ArrowLeft size={12} /> {t('production.weeks.backToList')}
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('production.weeks.weekOf', { date: data.weekStart.slice(0, 10) })}
          </h1>
          <p className="mt-0.5 text-xs text-gray-400">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[10px] font-semibold',
                data.closed
                  ? 'bg-gray-100 text-gray-500'
                  : 'bg-amber-50 text-amber-700',
              )}
            >
              {data.closed ? <Lock size={9} /> : <Unlock size={9} />}
              {data.closed
                ? t('production.weeks.closed')
                : t('production.weeks.open')}
            </span>
          </p>
        </div>
        {!data.closed && canClose && data.runs.length > 0 && (
          <CRMButton
            onClick={close}
            disabled={closing || !data.manualValid}
            leftIcon={closing ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
          >
            {closing ? t('production.weeks.closing') : t('production.weeks.closeBtn')}
          </CRMButton>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<Coins size={14} />}
          label={t('production.weeks.kpi.laborTotal')}
          value={`${data.laborTotal.toFixed(2)} MAD`}
        />
        <KpiCard
          label={t('production.weeks.kpi.runs')}
          value={String(data.runs.length)}
        />
        <KpiCard
          label={t('production.weeks.kpi.totalShare')}
          value={`${totalShare.toFixed(2)} MAD`}
        />
        <KpiCard
          label={t('production.weeks.kpi.unallocated')}
          value={`${(data.laborTotal - totalShare).toFixed(2)} MAD`}
        />
      </div>

      {!data.manualValid && (
        <GlassCard padding="md" className="mb-4 border-amber-200 bg-amber-50/40">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-800">
              {t('production.weeks.manualInvalid', { sum: data.manualSum.toFixed(2) })}
            </p>
          </div>
        </GlassCard>
      )}

      <GlassCard padding="md">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          {t('production.weeks.runsHeading')}
        </h2>
        {data.runs.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">
            {t('production.weeks.noRuns')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium">
                  {t('production.weeks.col.run')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.weeks.col.sample')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.weeks.col.pieces')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.weeks.col.mode')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.weeks.col.share')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.weeks.col.percent')}
                </th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => {
                const pct = data.laborTotal > 0 ? (r.share / data.laborTotal) * 100 : 0;
                return (
                  <tr key={r.runId} className="border-t border-gray-100">
                    <td className="py-2 font-mono text-xs font-semibold text-gray-700">
                      {r.reference}
                    </td>
                    <td className="py-2 text-gray-600">{r.sampleName ?? '—'}</td>
                    <td className="py-2 text-right text-gray-700">
                      {r.actualPieces} / {r.expectedPieces}
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-badge px-2 py-0.5 text-[10px] font-semibold',
                          MODE_TONE[r.mode],
                        )}
                      >
                        {t(`production.labor.mode.${r.mode}`)}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold text-gray-900">
                      {r.share.toFixed(2)} MAD
                    </td>
                    <td className="py-2 text-right text-gray-500">{pct.toFixed(1)}%</td>
                    <td className="py-2 text-right">
                      <Link
                        to={`/production/runs/${r.runId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        {t('common.open')}
                        <ExternalLink size={11} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </GlassCard>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <GlassCard padding="md">
      <p className="flex items-center gap-1 text-xs text-gray-400">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{value}</p>
    </GlassCard>
  );
}
