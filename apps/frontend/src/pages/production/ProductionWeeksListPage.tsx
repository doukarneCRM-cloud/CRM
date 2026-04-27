import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, Lock, Unlock, ChevronRight } from 'lucide-react';
import { GlassCard } from '@/components/ui';
import {
  productionApi,
  type ProductionWeekSummary,
} from '@/services/productionApi';
import { cn } from '@/lib/cn';

export default function ProductionWeeksListPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProductionWeekSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productionApi
      .listWeeks()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">
          {t('production.weeks.title')}
        </h1>
        <p className="text-xs text-gray-400">{t('production.weeks.subtitle')}</p>
      </div>

      <GlassCard padding="md">
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {t('production.weeks.loading')}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {t('production.weeks.empty')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium">
                  {t('production.weeks.col.week')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.weeks.col.status')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.weeks.col.runs')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.weeks.col.pieces')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.weeks.col.laborTotal')}
                </th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const ws = w.weekStart.slice(0, 10);
                return (
                  <tr key={w.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="py-2 font-mono text-xs text-gray-700">
                      <Calendar size={11} className="mr-1 inline-block text-gray-400" />
                      {ws}
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[10px] font-semibold',
                          w.closed
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-amber-50 text-amber-700',
                        )}
                      >
                        {w.closed ? <Lock size={9} /> : <Unlock size={9} />}
                        {w.closed
                          ? t('production.weeks.closed')
                          : t('production.weeks.open')}
                      </span>
                    </td>
                    <td className="py-2 text-right text-gray-700">{w.runCount}</td>
                    <td className="py-2 text-right text-gray-700">{w.totalPieces}</td>
                    <td className="py-2 text-right font-semibold text-gray-700">
                      {w.laborTotal.toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        to={`/production/weeks/${ws}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        {t('common.open')}
                        <ChevronRight size={12} />
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
