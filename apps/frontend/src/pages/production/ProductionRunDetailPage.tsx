import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { apiErrorMessage } from '@/lib/apiError';

type Tab = 'overview' | 'materials' | 'workers' | 'cost' | 'finish';

const STATUS_CLASSES: Record<RunStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-100 text-emerald-700',
  finished: 'bg-indigo-100 text-indigo-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function ProductionRunDetailPage() {
  const { t } = useTranslation();
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
      const fetched = await productionApi.getRun(id);
      setRun(fetched);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tabs = useMemo<Array<{ id: Tab; label: string }>>(
    () => [
      { id: 'overview', label: t('production.runDetail.tabs.overview') },
      { id: 'materials', label: t('production.runDetail.tabs.materials') },
      { id: 'workers', label: t('production.runDetail.tabs.workers') },
      ...(canViewCost
        ? [{ id: 'cost' as const, label: t('production.runDetail.tabs.cost') }]
        : []),
      { id: 'finish', label: t('production.runDetail.tabs.finish') },
    ],
    [t, canViewCost],
  );

  if (loading) return <div className="p-6 text-sm text-gray-400">{t('production.runDetail.loading')}</div>;
  if (!run) return <div className="p-6 text-sm text-gray-400">{t('production.runDetail.notFound')}</div>;

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
      pushToast({
        kind: 'error',
        title: t('production.runDetail.toast.saveFailedTitle'),
        body: apiErrorMessage(err, t('production.runDetail.toast.saveFallback')),
      });
    }
  }

  async function changeStatus(status: RunStatus) {
    if (!run) return;
    try {
      const updated = await productionApi.updateRun(run.id, { status });
      setRun(updated);
      pushToast({
        kind: 'success',
        title: t('production.runDetail.toast.statusNowTitle', {
          status: t(`production.runs.status.${status}`),
        }),
      });
    } catch (err) {
      pushToast({
        kind: 'error',
        title: t('production.runDetail.toast.statusFailedTitle'),
        body: apiErrorMessage(err, t('production.runDetail.toast.saveFallback')),
      });
    }
  }

  async function finish() {
    if (!run) return;
    if (!confirm(t('production.runDetail.confirmFinish', { ref: run.reference }))) return;
    try {
      const updated = await productionApi.finishRun(run.id);
      setRun(updated);
      pushToast({ kind: 'success', title: t('production.runDetail.toast.finishedTitle') });
    } catch (err) {
      pushToast({
        kind: 'error',
        title: t('production.runDetail.toast.finishFailedTitle'),
        body: apiErrorMessage(err, t('production.runDetail.toast.finishFallback')),
      });
    }
  }

  const locked = run.status === 'finished' || run.status === 'cancelled';
  const statusLabel = t(`production.runs.status.${run.status}`);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link
        to={ROUTES.PRODUCTION_RUNS}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary"
      >
        <ArrowLeft size={12} /> {t('production.runDetail.backToRuns')}
      </Link>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{run.reference}</h1>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLASSES[run.status]}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {run.test?.name ?? t('production.runDetail.noTest')} {'\u2022 '}
            {t('production.runDetail.startedOn', {
              date: new Date(run.startDate).toLocaleDateString(),
            })}
            {run.endDate && <> {'\u2192'} {new Date(run.endDate).toLocaleDateString()}</>}
          </p>
        </div>
        {canManage && !locked && (
          <div className="flex items-center gap-2">
            {run.status === 'draft' && (
              <CRMButton onClick={() => changeStatus('active')}>
                {t('production.runDetail.startRun')}
              </CRMButton>
            )}
            {run.status === 'active' && canFinish && (
              <CRMButton onClick={finish} leftIcon={<CheckCircle2 size={14} />}>
                {t('production.runDetail.finish')}
              </CRMButton>
            )}
            {(run.status === 'draft' || run.status === 'active') && (
              <button
                onClick={() => changeStatus('cancelled')}
                className="rounded-btn border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                {t('production.runDetail.cancelRun')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">{t('production.runDetail.kpi.pieces')}</p>
          <p className="text-lg font-bold text-gray-900">
            {run.actualPieces} / {run.expectedPieces}
          </p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">{t('production.runDetail.kpi.materials')}</p>
          <p className="text-lg font-bold text-gray-900">
            {run.materialsCost.toFixed(0)} MAD
          </p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">{t('production.runDetail.kpi.labor')}</p>
          <p className="text-lg font-bold text-gray-900">{run.laborCost.toFixed(0)} MAD</p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">{t('production.runDetail.kpi.costPerPiece')}</p>
          <p className="text-lg font-bold text-primary">
            {run.costPerPiece > 0 ? `${run.costPerPiece.toFixed(2)} MAD` : '\u2014'}
          </p>
        </GlassCard>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-gray-200">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`px-3 py-2 text-xs font-semibold transition ${
              tab === tabItem.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tabItem.label}
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
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <GlassCard padding="md">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          {t('production.runDetail.overview.sizes')}
        </h3>
        {run.sizes.length === 0 ? (
          <p className="text-xs text-gray-400">{t('production.runDetail.overview.noSizes')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1.5 text-left font-medium">
                  {t('production.runDetail.overview.colSize')}
                </th>
                <th className="py-1.5 text-right font-medium">
                  {t('production.runDetail.overview.colTracing')}
                </th>
                <th className="py-1.5 text-right font-medium">
                  {t('production.runDetail.overview.colExpected')}
                </th>
                <th className="py-1.5 text-right font-medium">
                  {t('production.runDetail.overview.colActual')}
                </th>
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
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          {t('production.runDetail.overview.notes')}
        </h3>
        <p className="whitespace-pre-wrap text-sm text-gray-700">{run.notes || '\u2014'}</p>
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
  const { t } = useTranslation();
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
      ([newTree, mats]) => {
        setTree(newTree);
        setAccessories(mats.filter((m) => m.category !== 'fabric' && m.isActive));
      },
    );
  }, []);

  const rollOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: '', label: t('production.runDetail.materials.selectRoll') },
    ];
    for (const g of tree) {
      for (const c of g.colors) {
        for (const r of c.rolls) {
          if (r.isDepleted) continue;
          opts.push({
            value: r.id,
            label: t('production.runDetail.materials.rollLabel', {
              type: g.typeName,
              color: c.color,
              remaining: r.remainingLength,
              rate: r.unitCostPerMeter,
            }),
          });
        }
      }
    }
    return opts;
  }, [tree, t]);

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
      pushToast({
        kind: 'success',
        title: t('production.runDetail.toast.consumeRecordedTitle'),
      });
      setQuantity(0);
      setFabricRollId('');
      setMaterialId('');
      onChanged();
      const [newTree, mats] = await Promise.all([
        atelieApi.fabricRollsTree(),
        atelieApi.listMaterials({}),
      ]);
      setTree(newTree);
      setAccessories(mats.filter((m) => m.category !== 'fabric' && m.isActive));
    } catch (err) {
      pushToast({
        kind: 'error',
        title: t('production.runDetail.toast.consumeFailedTitle'),
        body: apiErrorMessage(err, t('production.runDetail.toast.consumeFallback')),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && !locked && (
        <GlassCard padding="md">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            {t('production.runDetail.materials.record')}
          </h3>
          <div className="flex flex-wrap items-end gap-2">
            <CRMSelect
              label={t('production.runDetail.materials.source')}
              options={[
                {
                  value: 'fabric_roll',
                  label: t('production.runDetail.materials.sourceFabric'),
                },
                {
                  value: 'accessory',
                  label: t('production.runDetail.materials.sourceAccessory'),
                },
              ]}
              value={sourceType}
              onChange={(v) => setSourceType(v as 'fabric_roll' | 'accessory')}
              className="w-40"
            />
            {sourceType === 'fabric_roll' ? (
              <CRMSelect
                label={t('production.runDetail.materials.roll')}
                options={rollOptions}
                value={fabricRollId}
                onChange={(v) => setFabricRollId(v as string)}
                className="min-w-[22rem] flex-1"
              />
            ) : (
              <CRMSelect
                label={t('production.runDetail.materials.accessory')}
                options={[
                  { value: '', label: t('production.runDetail.materials.selectAccessory') },
                  ...accessories.map((m) => ({
                    value: m.id,
                    label: t('production.runDetail.materials.accessoryLabel', {
                      name: m.name,
                      stock: m.stock,
                      unit: m.unit,
                      cost: m.unitCost ?? 0,
                    }),
                  })),
                ]}
                value={materialId}
                onChange={(v) => setMaterialId(v as string)}
                className="min-w-[22rem] flex-1"
              />
            )}
            <CRMInput
              label={t('production.runDetail.materials.quantity')}
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
              {t('production.runDetail.materials.consume')}
            </CRMButton>
          </div>
        </GlassCard>
      )}

      <GlassCard padding="md">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          {t('production.runDetail.materials.history')}
        </h3>
        {run.consumptions.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">
            {t('production.runDetail.materials.empty')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 text-left font-medium">
                  {t('production.runDetail.materials.col.date')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.runDetail.materials.col.source')}
                </th>
                <th className="py-2 text-left font-medium">
                  {t('production.runDetail.materials.col.item')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.runDetail.materials.col.qty')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.runDetail.materials.col.unitCost')}
                </th>
                <th className="py-2 text-right font-medium">
                  {t('production.runDetail.materials.col.subtotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {run.consumptions.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="py-2 text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-gray-600">
                    {t(`production.runDetail.materials.sourceType.${c.sourceType}`)}
                  </td>
                  <td className="py-2 text-gray-900">
                    {c.fabricRoll
                      ? `${c.fabricRoll.fabricType.name} \u00b7 ${c.fabricRoll.color}`
                      : (c.material?.name ?? '\u2014')}
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
  const { t } = useTranslation();
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
      pushToast({ kind: 'success', title: t('production.runDetail.toast.workerAddedTitle') });
      setPickId('');
      onChanged();
    } catch (err) {
      pushToast({
        kind: 'error',
        title: t('production.runDetail.toast.workerAddFailedTitle'),
        body: apiErrorMessage(err, t('production.runDetail.toast.workerAddFallback')),
      });
    }
  }

  async function remove(empId: string) {
    try {
      await productionApi.removeWorker(run.id, empId);
      pushToast({ kind: 'success', title: t('production.runDetail.toast.workerRemovedTitle') });
      onChanged();
    } catch (err) {
      pushToast({
        kind: 'error',
        title: t('production.runDetail.toast.workerRemoveFailedTitle'),
        body: apiErrorMessage(err, t('production.runDetail.toast.workerRemoveFallback')),
      });
    }
  }

  return (
    <GlassCard padding="md">
      {canManage && !locked && (
        <div className="mb-4 flex items-end gap-2">
          <CRMSelect
            label={t('production.runDetail.workers.addWorker')}
            options={[
              { value: '', label: t('production.runDetail.workers.pickEmployee') },
              ...available.map((e) => ({
                value: e.id,
                label: t('production.runDetail.workers.personLabel', {
                  name: e.name,
                  role: e.role,
                }),
              })),
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
            {t('production.runDetail.workers.assign')}
          </CRMButton>
        </div>
      )}

      {run.workers.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-400">
          {t('production.runDetail.workers.empty')}
        </p>
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
                <p className="text-[11px] text-gray-500">{w.employee?.role ?? '\u2014'}</p>
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
  const { t } = useTranslation();
  const [data, setData] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productionApi
      .costBreakdown(runId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <p className="py-4 text-center text-xs text-gray-400">
        {t('production.runDetail.cost.loading')}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="py-4 text-center text-xs text-gray-400">
        {t('production.runDetail.cost.noData')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">{t('production.runDetail.cost.materials')}</p>
          <p className="text-base font-bold text-gray-900">
            {data.materialsCost.toFixed(2)}
          </p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">{t('production.runDetail.cost.labor')}</p>
          <p className="text-base font-bold text-gray-900">{data.laborCost.toFixed(2)}</p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">{t('production.runDetail.cost.total')}</p>
          <p className="text-base font-bold text-gray-900">{data.totalCost.toFixed(2)}</p>
        </GlassCard>
        <GlassCard padding="md">
          <p className="text-xs text-gray-400">
            {t('production.runDetail.cost.perPiece', { count: data.actualPieces })}
          </p>
          <p className="text-base font-bold text-primary">
            {data.costPerPiece.toFixed(2)}
          </p>
        </GlassCard>
      </div>

      <GlassCard padding="md">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          {t('production.runDetail.cost.materialsTitle')}
        </h3>
        {data.materials.length === 0 ? (
          <p className="py-2 text-xs text-gray-400">
            {t('production.runDetail.cost.noConsumption')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1.5 text-left font-medium">
                  {t('production.runDetail.cost.colItem')}
                </th>
                <th className="py-1.5 text-left font-medium">
                  {t('production.runDetail.cost.colSource')}
                </th>
                <th className="py-1.5 text-right font-medium">
                  {t('production.runDetail.cost.colQty')}
                </th>
                <th className="py-1.5 text-right font-medium">
                  {t('production.runDetail.cost.colUnit')}
                </th>
                <th className="py-1.5 text-right font-medium">
                  {t('production.runDetail.cost.colSubtotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.materials.map((m, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-900">{m.name}</td>
                  <td className="py-1.5 text-gray-500">
                    {t(`production.runDetail.materials.sourceType.${m.sourceType}`)}
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
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          {t('production.runDetail.cost.laborTitle')}
        </h3>
        <p className="mb-2 text-[11px] text-gray-400">
          {t('production.runDetail.cost.laborHelp')}
        </p>
        {data.laborDaily.length === 0 ? (
          <p className="py-2 text-xs text-gray-400">
            {t('production.runDetail.cost.noLabor')}
          </p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-xs text-gray-500">
                <tr>
                  <th className="py-1.5 text-left font-medium">
                    {t('production.runDetail.cost.colDate')}
                  </th>
                  <th className="py-1.5 text-left font-medium">
                    {t('production.runDetail.cost.colWorker')}
                  </th>
                  <th className="py-1.5 text-right font-medium">
                    {t('production.runDetail.cost.colDailyRate')}
                  </th>
                  <th className="py-1.5 text-right font-medium">
                    {t('production.runDetail.cost.colRuns')}
                  </th>
                  <th className="py-1.5 text-right font-medium">
                    {t('production.runDetail.cost.colShare')}
                  </th>
                  <th className="py-1.5 text-right font-medium">
                    {t('production.runDetail.cost.colAtt')}
                  </th>
                  <th className="py-1.5 text-right font-medium">
                    {t('production.runDetail.cost.colCost')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.laborDaily.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-500">
                      {new Date(row.date).toLocaleDateString()}
                    </td>
                    <td className="py-1.5 text-gray-900">{row.employeeName}</td>
                    <td className="py-1.5 text-right text-gray-600">
                      {row.dailyRate.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right text-gray-600">{row.overlapCount}</td>
                    <td className="py-1.5 text-right text-gray-600">
                      {row.share.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right text-gray-600">
                      {weightLabel(row.weight, t)}
                    </td>
                    <td className="py-1.5 text-right font-semibold text-gray-900">
                      {row.contribution.toFixed(2)}
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

function weightLabel(weight: number, t: TFunction): string {
  if (weight === 1) return t('production.runDetail.cost.attFull');
  if (weight === 0.5) return t('production.runDetail.cost.attHalf');
  return t('production.runDetail.cost.attAbsent');
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
  const { t } = useTranslation();
  const statusLabel = t(`production.runs.status.${run.status}`);
  return (
    <GlassCard padding="md">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        {t('production.runDetail.finish.title')}
      </h3>
      {locked ? (
        <p
          className="text-sm text-gray-600"
          dangerouslySetInnerHTML={{
            __html: t('production.runDetail.finish.lockedBody', {
              status: escapeHtml(statusLabel),
              cost: run.costPerPiece.toFixed(2),
            }),
          }}
        />
      ) : (
        <>
          <p
            className="mb-3 text-sm text-gray-600"
            dangerouslySetInnerHTML={{
              __html: t('production.runDetail.finish.activeBody'),
            }}
          />
          <CRMButton
            onClick={onFinish}
            disabled={!canFinish || run.actualPieces <= 0}
            leftIcon={<CheckCircle2 size={14} />}
          >
            {t('production.runDetail.finish.button')}
          </CRMButton>
          {run.actualPieces <= 0 && (
            <p className="mt-2 text-[11px] text-amber-600">
              {t('production.runDetail.finish.needActual')}
            </p>
          )}
          {!canFinish && (
            <p
              className="mt-2 text-[11px] text-gray-500"
              dangerouslySetInnerHTML={{
                __html: t('production.runDetail.finish.noPermission'),
              }}
            />
          )}
        </>
      )}
    </GlassCard>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
