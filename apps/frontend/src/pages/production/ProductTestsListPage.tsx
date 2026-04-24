import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard, CRMButton } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { productionApi, type ProductTest } from '@/services/productionApi';
import { ProductTestFormModal } from './components/ProductTestFormModal';

export default function ProductTestsListPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProductTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  function load() {
    setLoading(true);
    productionApi
      .listTests()
      .then(setRows)
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('production.tests.title')}</h1>
          <p className="text-xs text-gray-400">{t('production.tests.subtitle')}</p>
        </div>
        <CRMButton leftIcon={<Plus size={14} />} onClick={() => setFormOpen(true)}>
          {t('production.tests.newTest')}
        </CRMButton>
      </div>

      <GlassCard padding="md">
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {t('production.tests.loading')}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{t('production.tests.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium">{t('production.tests.col.name')}</th>
                <th className="py-2 text-left font-medium">
                  {t('production.tests.col.product')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.tests.col.estPerPiece')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.tests.col.sizes')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.tests.col.created')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((test) => (
                <tr key={test.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <Link
                      to={ROUTES.PRODUCTION_TEST_DETAIL.replace(':id', test.id)}
                      className="font-semibold text-primary hover:underline"
                    >
                      {test.name}
                    </Link>
                  </td>
                  <td className="py-2 text-gray-600">{test.product?.name ?? '\u2014'}</td>
                  <td className="py-2 text-right text-gray-700">
                    {test.estimatedCostPerPiece != null
                      ? test.estimatedCostPerPiece.toFixed(2)
                      : '\u2014'}
                  </td>
                  <td className="py-2 text-right text-gray-700">{test.sizes.length}</td>
                  <td className="py-2 text-gray-500">
                    {new Date(test.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
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
