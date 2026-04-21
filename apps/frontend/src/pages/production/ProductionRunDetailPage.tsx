import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, UserPlus, X } from 'lucide-react';
import { GlassCard, CRMInput, CRMSelect, CRMButton } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import {
  productionApi,
  type ProductionRun,
  type RunStatus,
  type CostBreakdown,
} from '@/services/productionApi';
import {
  atelieApi,
  type AtelieEmployee,
  type FabricTypeGroup,
  type Material,
} from '@/services/atelieApi';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';

type Tab = 'overview' | 'materials' | 'workers' | 'cost' | 'finish';

const STATUS_CLASSES: Record<RunStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-100 text-emerald-700',
  finished: 'bg-indigo-100 text-indigo-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function ProductionRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pushToast = useToastStore((s) => s.push);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('production:manage');
  const canFinish = hasPermission('production:finish');
  const canViewCost = hasPermission('production:cost:view');

  const [run, setRun] = useState<ProductionRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const r = await productionApi.getRun(id);
      setRun(r);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  if (!run) return <div className="p-6 text-sm text-gray-400">Not found.</div>;

  async function updateActual(sizeId: string, actual: number) {
    if (!run) return;
    const sizes = run.sizes.map((s) =>
      s.id === sizeId
        ? {
            size: s.size,
            tracingMeters: s.tracingMeters,
            expectedPieces: s.expectedPieces,
            actualPieces: actual,
            variantId: s.variantId,
          }
        : {
            size: s.size,
            tracingMeters: s.tracingMeters,
            expectedPieces: s.expectedPieces,
            actualPieces: s.actualPieces,
            variantId: s.variantId,
          },
    );
    try {
      const updated = await productionApi.updateRun(run.id, { sizes });
      setRun(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      pushToast({ kind: 'error', title: 'Save failed', body: msg });
    }
  }

  async function changeStatus(status: RunStatus) {
    if (!run) return;
    try {
      const updated = await productionApi.updateRun(run.id, { status });
      setRun(updated);
      pushToast({ kind: 'success', title: `Run is now ${status}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      pushToast({ kind: 'error', title: 'Status change failed', body: msg });
    }
  }

  async function finish() {
    if (!run) return;
    if (!confirm(`Finish run ${run.reference}? This snapshots the cost and locks the run.`))
      return;
    try {
      const updated = await productionApi.finishRun(run.id);
      setRun(updated);
      pushToast({ kind: 'success', title: 'Run finished' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Finish failed';
      pushToast({ kind: 'error', title: 'Finish failed', body: msg });
    }
  }

  const locked = run.status === 'finished' || run.status === 'cancelled';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link
        to={ROUTES.PRODUCTION_RUNS}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary"
      >
        <ArrowLeft size={12} /> Back to runs
      </Link>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{run.reference}</h1>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLASSES[run.status]}`}
            >
              {run.status}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {run.test?.name ?? 'No test'} • Started{' '}
            {new Date(run.startDate).toLocaleDateString()}
            {run.endDate && <> → {new Date(run.endDate).toLocaleDateString()}</>}
          </p>
        </div>
        {canManage && !locked && (
          <div className="flex items-center gap-2">
            {run.status === 'draft' && (
              <CRMButton onClick={() => changeStatus('active')}>Start run</CRMButton>
            )}
            {run.status === 'active' && canFinish && (
              <CRMButton onClick={finish} leftIcon={<CheckCircle2 size={14} />}>
                Finish
              </CRMButton>
            )}
            {(run.status === 'draft' || run.status === 'active') && (
              <button
                onClick={() => changeStatus('cancelled')}
                className="rounded-btn border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Cancel run
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">Pieces</p>
          <p className="text-lg font-bold text-gray-900">
            {run.actualPieces} / {run.expectedPieces}
          </p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">Materials</p>
          <p className="text-lg font-bold text-gray-900">
            {run.materialsCost.toFixed(0)} MAD
          </p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">Labor</p>
          <p className="text-lg font-bold text-gray-900">{run.laborCost.toFixed(0)} MAD</p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">Cost / piece</p>
          <p className="text-lg font-bold text-primary">
            {run.costPerPiece > 0 ? `${run.costPerPiece.toFixed(2)} MAD` : '—'}
          </p>
        </GlassCard>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-gray-200">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'materials', label: 'Fabric & accessories' },
            { id: 'workers', label: 'Workers' },
            ...(canViewCost ? [{ id: 'cost' as const, label: 'Cost breakdown' }] : []),
            { id: 'finish', label: 'Finish' },
          ] as Array<{ id: Tab; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-semibold transition ${
              tab === t.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab run={run} locked={locked} onUpdateActual={updateActual} />
      )}
      {tab === 'materials' && (
        <MaterialsTab run={run} locked={locked} canManage={canManage} onChanged={load} />
      )}
      {tab === 'workers' && (
        <WorkersTab run={run} locked={locked} canManage={canManage} onChanged={load} />
      )}
      {tab === 'cost' && canViewCost && <CostTab runId={run.id} />}
      {tab === 'finish' && (
        <FinishTab run={run} locked={locked} canFinish={canFinish} onFinish={finish} />
      )}
    </div>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────────

function OverviewTab({
  run,
  locked,
  onUpdateActual,
}: {
  run: ProductionRun;
  locked: boolean;
  onUpdateActual: (sizeId: string, actual: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <GlassCard padding="md">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Sizes</h3>
        {run.sizes.length === 0 ? (
          <p className="text-xs text-gray-400">No sizes configured.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1.5 text-left font-medium">Size</th>
                <th className="py-1.5 text-right font-medium">Tracing (m)</th>
                <th className="py-1.5 text-right font-medium">Expected</th>
                <th className="py-1.5 text-right font-medium">Actual</th>
              </tr>
            </thead>
            <tbody>
              {run.sizes.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-900">{s.size}</td>
                  <td className="py-1.5 text-right text-gray-600">
                    {s.tracingMeters.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right text-gray-600">{s.expectedPieces}</td>
                  <td className="py-1.5 text-right">
                    {locked ? (
                      <span className="text-gray-900">{s.actualPieces}</span>
                    ) : (
                      <input
                        type="number"
                        defaultValue={s.actualPieces}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== s.actualPieces) onUpdateActual(s.id, v);
                        }}
                        className="w-20 rounded-input border border-gray-200 px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>

      <GlassCard padding="md">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Notes</h3>
        <p className="whitespace-pre-wrap text-sm text-gray-700">{run.notes || '—'}</p>
      </GlassCard>
    </div>
  );
}

// ─── Materials (fabric + accessories consumption) ──────────────────────────

function MaterialsTab({
  run,
  locked,
  canManage,
  onChanged,
}: {
  run: ProductionRun;
  locked: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [tree, setTree] = useState<FabricTypeGroup[]>([]);
  const [accessories, setAccessories] = useState<Material[]>([]);
  const [sourceType, setSourceType] = useState<'fabric_roll' | 'accessory'>('fabric_roll');
  const [fabricRollId, setFabricRollId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [quantity, setQuantity] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([atelieApi.fabricRollsTree(), atelieApi.listMaterials({})]).then(
      ([t, mats]) => {
        setTree(t);
        setAccessories(mats.filter((m) => m.category !== 'fabric' && m.isActive));
      },
    );
  }, []);

  const rollOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: '', label: 'Select roll…' },
    ];
    for (const g of tree) {
      for (const c of g.colors) {
        for (const r of c.rolls) {
          if (r.isDepleted) continue;
          opts.push({
            value: r.id,
            label: `${g.typeName} · ${c.color} · ${r.remainingLength}m left @ ${r.unitCostPerMeter}/m`,
          });
        }
      }
    }
    return opts;
  }, [tree]);

  async function addConsumption() {
    if (quantity <= 0) return;
    setSaving(true);
    try {
      await productionApi.consume(run.id, {
        sourceType,
        fabricRollId: sourceType === 'fabric_roll' ? fabricRollId : undefined,
        materialId: sourceType === 'accessory' ? materialId : undefined,
        quantity,
      });
      pushToast({ kind: 'success', title: 'Consumption recorded' });
      setQuantity(0);
      setFabricRollId('');
      setMaterialId('');
      onChanged();
      const [t, mats] = await Promise.all([
        atelieApi.fabricRollsTree(),
        atelieApi.listMaterials({}),
      ]);
      setTree(t);
      setAccessories(mats.filter((m) => m.category !== 'fabric' && m.isActive));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Consume failed';
      pushToast({ kind: 'error', title: 'Consume failed', body: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && !locked && (
        <GlassCard padding="md">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Record consumption</h3>
          <div className="flex flex-wrap items-end gap-2">
            <CRMSelect
              label="Source"
              options={[
                { value: 'fabric_roll', label: 'Fabric roll' },
                { value: 'accessory', label: 'Accessory' },
              ]}
              value={sourceType}
              onChange={(v) => setSourceType(v as 'fabric_roll' | 'accessory')}
              className="w-40"
            />
            {sourceType === 'fabric_roll' ? (
              <CRMSelect
                label="Roll"
                options={rollOptions}
                value={fabricRollId}
                onChange={(v) => setFabricRollId(v as string)}
                className="min-w-[22rem] flex-1"
              />
            ) : (
              <CRMSelect
                label="Accessory"
                options={[
                  { value: '', label: 'Select accessory…' },
                  ...accessories.map((m) => ({
                    value: m.id,
                    label: `${m.name} · ${m.stock} ${m.unit} @ ${m.unitCost ?? 0}/${m.unit}`,
                  })),
                ]}
                value={materialId}
                onChange={(v) => setMaterialId(v as string)}
                className="min-w-[22rem] flex-1"
              />
            )}
            <CRMInput
              label="Quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-28"
            />
            <CRMButton
              onClick={addConsumption}
              disabled={
                saving ||
                quantity <= 0 ||
                (sourceType === 'fabric_roll' ? !fabricRollId : !materialId)
              }
              leftIcon={<Plus size={14} />}
            >
              Consume
            </CRMButton>
          </div>
        </GlassCard>
      )}

      <GlassCard padding="md">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">History</h3>
        {run.consumptions.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">Nothing consumed yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium">Date</th>
                <th className="py-2 text-left font-medium">Source</th>
                <th className="py-2 text-left font-medium">Item</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Unit cost</th>
                <th className="py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {run.consumptions.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="py-2 text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 capitalize text-gray-600">
                    {c.sourceType.replace('_', ' ')}
                  </td>
                  <td className="py-2 text-gray-900">
                    {c.fabricRoll
                      ? `${c.fabricRoll.fabricType.name} · ${c.fabricRoll.color}`
                      : (c.material?.name ?? '—')}
                  </td>
                  <td className="py-2 text-right text-gray-700">{c.quantity}</td>
                  <td className="py-2 text-right text-gray-600">
                    {c.unitCost.toFixed(2)}
                  </td>
                  <td className="py-2 text-right font-semibold text-gray-900">
                    {(c.quantity * c.unitCost).toFixed(2)}
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

// ─── Workers ───────────────────────────────────────────────────────────────

function WorkersTab({
  run,
  locked,
  canManage,
  onChanged,
}: {
  run: ProductionRun;
  locked: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [employees, setEmployees] = useState<AtelieEmployee[]>([]);
  const [pickId, setPickId] = useState('');

  useEffect(() => {
    atelieApi.listEmployees(true).then(setEmployees);
  }, []);

  const assignedIds = new Set(run.workers.map((w) => w.employeeId));
  const available = employees.filter((e) => !assignedIds.has(e.id));

  async function add() {
    if (!pickId) return;
    try {
      await productionApi.addWorker(run.id, pickId);
      pushToast({ kind: 'success', title: 'Worker added' });
      setPickId('');
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      pushToast({ kind: 'error', title: 'Add failed', body: msg });
    }
  }

  async function remove(empId: string) {
    try {
      await productionApi.removeWorker(run.id, empId);
      pushToast({ kind: 'success', title: 'Worker removed' });
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      pushToast({ kind: 'error', title: 'Remove failed', body: msg });
    }
  }

  return (
    <GlassCard padding="md">
      {canManage && !locked && (
        <div className="mb-4 flex items-end gap-2">
          <CRMSelect
            label="Add worker"
            options={[
              { value: '', label: 'Pick employee…' },
              ...available.map((e) => ({ value: e.id, label: `${e.name} · ${e.role}` })),
            ]}
            value={pickId}
            onChange={(v) => setPickId(v as string)}
            className="min-w-[20rem] flex-1"
          />
          <CRMButton
            onClick={add}
            disabled={!pickId}
            leftIcon={<UserPlus size={14} />}
          >
            Assign
          </CRMButton>
        </div>
      )}

      {run.workers.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-400">No workers assigned.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {run.workers.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between rounded-input bg-gray-50 px-3 py-2"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {w.employee?.name ?? w.employeeId}
                </p>
                <p className="text-[11px] text-gray-500">{w.employee?.role ?? '—'}</p>
              </div>
              {canManage && !locked && (
                <button
                  onClick={() => remove(w.employeeId)}
                  className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

// ─── Cost breakdown ────────────────────────────────────────────────────────

function CostTab({ runId }: { runId: string }) {
  const [data, setData] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productionApi
      .costBreakdown(runId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return <p className="py-4 text-center text-xs text-gray-400">Loading cost breakdown…</p>;
  }
  if (!data) {
    return <p className="py-4 text-center text-xs text-gray-400">No data.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">Materials</p>
          <p className="text-base font-bold text-gray-900">
            {data.materialsCost.toFixed(2)}
          </p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">Labor</p>
          <p className="text-base font-bold text-gray-900">{data.laborCost.toFixed(2)}</p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">Total</p>
          <p className="text-base font-bold text-gray-900">{data.totalCost.toFixed(2)}</p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">Per piece ({data.actualPieces})</p>
          <p className="text-base font-bold text-primary">
            {data.costPerPiece.toFixed(2)}
          </p>
        </GlassCard>
      </div>

      <GlassCard padding="md">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Materials</h3>
        {data.materials.length === 0 ? (
          <p className="py-2 text-xs text-gray-400">No consumption yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1.5 text-left font-medium">Item</th>
                <th className="py-1.5 text-left font-medium">Source</th>
                <th className="py-1.5 text-right font-medium">Qty</th>
                <th className="py-1.5 text-right font-medium">Unit</th>
                <th className="py-1.5 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {data.materials.map((m, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-900">{m.name}</td>
                  <td className="py-1.5 capitalize text-gray-500">
                    {m.sourceType.replace('_', ' ')}
                  </td>
                  <td className="py-1.5 text-right text-gray-600">{m.quantity}</td>
                  <td className="py-1.5 text-right text-gray-600">
                    {m.unitCost.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right font-semibold text-gray-900">
                    {m.subtotal.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>

      <GlassCard padding="md">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Labor (per day)</h3>
        <p className="mb-2 text-[11px] text-gray-400">
          Each day, the worker's daily wage (base salary ÷ working days) is split equally
          across every run they're active on, then weighted by attendance (full = 1, half =
          0.5, absent = 0).
        </p>
        {data.laborDaily.length === 0 ? (
          <p className="py-2 text-xs text-gray-400">No labor recorded yet.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-xs text-gray-500">
                <tr>
                  <th className="py-1.5 text-left font-medium">Date</th>
                  <th className="py-1.5 text-left font-medium">Worker</th>
                  <th className="py-1.5 text-right font-medium">Daily rate</th>
                  <th className="py-1.5 text-right font-medium">Runs</th>
                  <th className="py-1.5 text-right font-medium">Share</th>
                  <th className="py-1.5 text-right font-medium">Att.</th>
                  <th className="py-1.5 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.laborDaily.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-500">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="py-1.5 text-gray-900">{r.employeeName}</td>
                    <td className="py-1.5 text-right text-gray-600">
                      {r.dailyRate.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right text-gray-600">{r.overlapCount}</td>
                    <td className="py-1.5 text-right text-gray-600">
                      {r.share.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right text-gray-600">
                      {r.weight === 1
                        ? 'full'
                        : r.weight === 0.5
                          ? 'half'
                          : 'absent'}
                    </td>
                    <td className="py-1.5 text-right font-semibold text-gray-900">
                      {r.contribution.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Finish tab ────────────────────────────────────────────────────────────

function FinishTab({
  run,
  locked,
  canFinish,
  onFinish,
}: {
  run: ProductionRun;
  locked: boolean;
  canFinish: boolean;
  onFinish: () => void;
}) {
  return (
    <GlassCard padding="md">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Finish run</h3>
      {locked ? (
        <p className="text-sm text-gray-600">
          This run is <strong className="capitalize">{run.status}</strong>. The cost per piece
          is snapshotted at{' '}
          <strong className="text-primary">{run.costPerPiece.toFixed(2)} MAD</strong>.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-600">
            Finishing will lock the run, snapshot its cost per piece, and stop including it
            in future labor allocation. <strong>It does not update</strong> the linked
            product variant's <code>costPrice</code> — that remains admin-managed for
            analytics.
          </p>
          <CRMButton
            onClick={onFinish}
            disabled={!canFinish || run.actualPieces <= 0}
            leftIcon={<CheckCircle2 size={14} />}
          >
            Finish & snapshot
          </CRMButton>
          {run.actualPieces <= 0 && (
            <p className="mt-2 text-[11px] text-amber-600">
              Set an actual-pieces count in Overview before finishing.
            </p>
          )}
          {!canFinish && (
            <p className="mt-2 text-[11px] text-gray-500">
              You don't have the <code>production:finish</code> permission.
            </p>
          )}
        </>
      )}
    </GlassCard>
  );
}
