import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
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
          <h1 className="text-lg font-bold text-gray-900">Production runs</h1>
          <p className="text-xs text-gray-400">
            Active builds — consume fabric rolls and accessories, assign workers, and see the
            cost per piece.
          </p>
        </div>
        <CRMButton leftIcon={<Plus size={14} />} onClick={() => setNewOpen(true)}>
          New run
        </CRMButton>
      </div>

      <GlassCard padding="md">
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium">Ref</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Test</th>
                <th className="py-2 text-left font-medium">Dates</th>
                <th className="py-2 text-right font-medium">Pieces</th>
                <th className="py-2 text-right font-medium">Materials</th>
                <th className="py-2 text-right font-medium">Labor</th>
                <th className="py-2 text-right font-medium">Cost / piece</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <Link
                      to={ROUTES.PRODUCTION_RUN_DETAIL.replace(':id', r.id)}
                      className="font-semibold text-primary hover:underline"
                    >
                      {r.reference}
                    </Link>
                  </td>
                  <td className="py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLASSES[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 text-gray-600">{r.test?.name ?? '—'}</td>
                  <td className="py-2 text-gray-500">
                    {new Date(r.startDate).toLocaleDateString()} →{' '}
                    {r.endDate ? new Date(r.endDate).toLocaleDateString() : 'open'}
                  </td>
                  <td className="py-2 text-right text-gray-700">
                    {r.actualPieces} / {r.expectedPieces}
                  </td>
                  <td className="py-2 text-right text-gray-700">
                    {r.materialsCost.toFixed(0)}
                  </td>
                  <td className="py-2 text-right text-gray-700">{r.laborCost.toFixed(0)}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">
                    {r.costPerPiece > 0 ? `${r.costPerPiece.toFixed(2)}` : '—'}
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
