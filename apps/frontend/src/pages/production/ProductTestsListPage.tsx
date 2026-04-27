import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard, CRMButton } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import {
  productionApi,
  type ProductTest,
  type SampleStatus,
} from '@/services/productionApi';
import { resolveImageUrl } from '@/lib/imageUrl';
import { cn } from '@/lib/cn';
import { ProductTestFormModal } from './components/ProductTestFormModal';
import { SampleStatusPill } from './components/SampleStatusPill';

type StatusTab = SampleStatus | 'all';

const TABS: StatusTab[] = ['all', 'draft', 'tested', 'approved', 'archived'];

export default function ProductTestsListPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProductTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [tab, setTab] = useState<StatusTab>('all');

  function load() {
    setLoading(true);
    productionApi
      .listTests()
      .then(setRows)
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = {
      all: rows.length,
      draft: 0,
      tested: 0,
      approved: 0,
      archived: 0,
    };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const visible = useMemo(
    () => (tab === 'all' ? rows : rows.filter((r) => r.status === tab)),
    [rows, tab],
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">
            {t('production.samples.title')}
          </h1>
          <p className="text-xs text-gray-400">{t('production.samples.subtitle')}</p>
        </div>
        <CRMButton leftIcon={<Plus size={14} />} onClick={() => setFormOpen(true)}>
          {t('production.samples.newSample')}
        </CRMButton>
      </div>

      {/* Status tabs — quick filter; counts come from the loaded list. */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((s) => {
          const active = tab === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-btn border px-3 py-1.5 text-xs font-semibold transition-colors',
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
              )}
            >
              {t(`production.samples.tabs.${s}`)}
              <span
                className={cn(
                  'rounded-badge px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
                )}
              >
                {counts[s]}
              </span>
            </button>
          );
        })}
      </div>

      <GlassCard padding="md">
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {t('production.samples.loading')}
          </p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {tab === 'all'
              ? t('production.samples.empty')
              : t('production.samples.emptyTab', { tab: t(`production.samples.tabs.${tab}`) })}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium" colSpan={2}>
                  {t('production.samples.col.name')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.samples.col.status')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.samples.col.product')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.samples.col.estPerPiece')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.samples.col.suggestedPrice')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.samples.col.sizes')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.samples.col.created')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((sample) => {
                const cover = sample.photos?.[0];
                return (
                  <tr key={sample.id} className="border-t border-gray-100">
                    <td className="py-2 pr-2">
                      {cover ? (
                        <img
                          src={resolveImageUrl(cover.url) || cover.url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-300">
                          <ImageIcon size={14} />
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      <Link
                        to={ROUTES.PRODUCTION_TEST_DETAIL.replace(':id', sample.id)}
                        className="font-semibold text-primary hover:underline"
                      >
                        {sample.name}
                      </Link>
                    </td>
                    <td className="py-2">
                      <SampleStatusPill status={sample.status} />
                    </td>
                    <td className="py-2 text-gray-600">{sample.product?.name ?? '—'}</td>
                    <td className="py-2 text-right font-semibold text-gray-700">
                      {sample.estimatedCostPerPiece != null
                        ? `${Number(sample.estimatedCostPerPiece).toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="py-2 text-right font-semibold text-emerald-700">
                      {sample.suggestedPrice != null
                        ? `${Number(sample.suggestedPrice).toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="py-2 text-right text-gray-700">{sample.sizes.length}</td>
                    <td className="py-2 text-gray-500">
                      {new Date(sample.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </GlassCard>

      <ProductTestFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
