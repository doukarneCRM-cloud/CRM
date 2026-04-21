import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GlassCard, CRMButton } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { productionApi, type ProductTest } from '@/services/productionApi';
import { ProductTestFormModal } from './components/ProductTestFormModal';

export default function ProductTestsListPage() {
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
          <h1 className="text-lg font-bold text-gray-900">Product tests</h1>
          <p className="text-xs text-gray-400">
            Prototypes — video reference, fabrics needed, sizes, tracing, accessories, and a
            rough cost estimate.
          </p>
        </div>
        <CRMButton leftIcon={<Plus size={14} />} onClick={() => setFormOpen(true)}>
          New test
        </CRMButton>
      </div>

      <GlassCard padding="md">
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No product tests yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium">Name</th>
                <th className="py-2 text-left font-medium">Product</th>
                <th className="py-2 text-right font-medium">Est. MAD / piece</th>
                <th className="py-2 text-right font-medium">Sizes</th>
                <th className="py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <Link
                      to={ROUTES.PRODUCTION_TEST_DETAIL.replace(':id', t.id)}
                      className="font-semibold text-primary hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="py-2 text-gray-600">{t.product?.name ?? '—'}</td>
                  <td className="py-2 text-right text-gray-700">
                    {t.estimatedCostPerPiece != null
                      ? t.estimatedCostPerPiece.toFixed(2)
                      : '—'}
                  </td>
                  <td className="py-2 text-right text-gray-700">{t.sizes.length}</td>
                  <td className="py-2 text-gray-500">
                    {new Date(t.createdAt).toLocaleDateString()}
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
