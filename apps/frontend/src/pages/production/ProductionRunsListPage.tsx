import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard, CRMButton } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { productionApi, type ProductionRun, type RunStatus } from '@/services/productionApi';
import { NewRunModal } from './components/NewRunModal';

const STATUS_CLASSES: Record<RunStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-100 text-emerald-700',
  finished: 'bg-indigo-100 text-indigo-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function ProductionRunsListPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProductionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  function load() {
    setLoading(true);
    productionApi
      .listRuns()
      .then(setRows)
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('production.runs.title')}</h1>
          <p className="text-xs text-gray-400">{t('production.runs.subtitle')}</p>
        </div>
        <CRMButton leftIcon={<Plus size={14} />} onClick={() => setNewOpen(true)}>
          {t('production.runs.newRun')}
        </CRMButton>
      </div>

      <GlassCard padding="md">
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">{t('production.runs.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{t('production.runs.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium">{t('production.runs.col.ref')}</th>
                <th className="py-2 text-left font-medium">{t('production.runs.col.status')}</th>
                <th className="py-2 text-left font-medium">{t('production.runs.col.test')}</th>
                <th className="py-2 text-left font-medium">{t('production.runs.col.dates')}</th>
                <th className="py-2 text-right font-medium">{t('production.runs.col.pieces')}</th>
                <th className="py-2 text-right font-medium">
                  {t('production.runs.col.materials')}
                </th>
                <th className="py-2 text-right font-medium">{t('production.runs.col.labor')}</th>
                <th className="py-2 text-right font-medium">
                  {t('production.runs.col.costPerPiece')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <Link
                      to={ROUTES.PRODUCTION_RUN_DETAIL.replace(':id', row.id)}
                      className="font-semibold text-primary hover:underline"
                    >
                      {row.reference}
                    </Link>
                  </td>
                  <td className="py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLASSES[row.status]}`}
                    >
                      {t(`production.runs.status.${row.status}`)}
                    </span>
                  </td>
                  <td className="py-2 text-gray-600">{row.test?.name ?? '\u2014'}</td>
                  <td className="py-2 text-gray-500">
                    {new Date(row.startDate).toLocaleDateString()} {'\u2192'}{' '}
                    {row.endDate
                      ? new Date(row.endDate).toLocaleDateString()
                      : t('production.runs.open')}
                  </td>
                  <td className="py-2 text-right text-gray-700">
                    {row.actualPieces} / {row.expectedPieces}
                  </td>
                  <td className="py-2 text-right text-gray-700">
                    {row.materialsCost.toFixed(0)}
                  </td>
                  <td className="py-2 text-right text-gray-700">{row.laborCost.toFixed(0)}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">
                    {row.costPerPiece > 0 ? `${row.costPerPiece.toFixed(2)}` : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>

      <NewRunModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={load} />
    </div>
  );
}
