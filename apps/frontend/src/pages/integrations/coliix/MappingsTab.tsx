import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Trash2, Save, AlertTriangle } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  coliixApi,
  ASSIGNABLE_SHIPMENT_STATES,
  type ColiixMapping,
  type ShipmentState,
} from '@/services/coliixApi';
import { useToastStore } from '@/store/toastStore';

type FilterId = 'all' | 'mapped' | 'unknown';

// Display labels for the assignable states. Sourced from the same
// dictionary the rest of the CRM uses so the badges match the Order
// detail page and the dashboard.
const STATE_LABEL: Record<ShipmentState, string> = {
  pending: 'Pending (local)',
  pushed: 'Pushed (label ready, awaiting carrier)',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  failed_delivery: 'Failed delivery',
  reported: 'Delivery postponed',
  delivered: 'Delivered',
  returned: 'Returned',
};

export function MappingsTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ColiixMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await coliixApi.listMappings({ filter, search: search.trim() || undefined });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unknownCount = useMemo(() => rows.filter((r) => !r.internalState).length, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('coliix.mappings.title')}</h2>
          <p className="text-xs text-gray-500">{t('coliix.mappings.subtitle')}</p>
        </div>
        <CRMButton variant="primary" size="sm" leftIcon={<Plus size={13} />} onClick={() => setShowAdd(true)}>
          {t('coliix.mappings.addManual')}
        </CRMButton>
      </div>

      {/* Unknown badge */}
      {filter !== 'unknown' && unknownCount > 0 && (
        <button
          onClick={() => setFilter('unknown')}
          className="flex items-center gap-2 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          <AlertTriangle size={14} />
          {t('coliix.mappings.unknownBadge', { count: unknownCount })}
        </button>
      )}

      {/* Filter + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md bg-gray-100 p-0.5">
          {(['all', 'mapped', 'unknown'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-3 py-1 text-xs font-semibold ${
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t(`coliix.mappings.filter.${f}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            placeholder={t('coliix.mappings.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <AddMappingForm
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}

      {/* Table */}
      {loading ? (
        <div className="skeleton h-32 w-full rounded-md" />
      ) : rows.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-gray-500">{t('coliix.mappings.empty')}</p>
          <p className="mt-1 text-xs italic text-gray-400">{t('coliix.mappings.emptyHint')}</p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden p-0">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">{t('coliix.mappings.colWording')}</th>
                  <th className="px-4 py-2 font-semibold">{t('coliix.mappings.colMapsTo')}</th>
                  <th className="px-4 py-2 font-semibold">{t('coliix.mappings.colTerminal')}</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    {t('coliix.mappings.colUsage')}
                  </th>
                  <th className="px-4 py-2 font-semibold">{t('coliix.mappings.colNote')}</th>
                  <th className="px-4 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <MappingRow key={r.id} row={r} onChanged={refresh} />
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

// ─── One row ───────────────────────────────────────────────────────────────

function MappingRow({ row, onChanged }: { row: ColiixMapping; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.push);
  const [internalState, setInternalState] = useState<ShipmentState | null>(row.internalState);
  const [isTerminal, setIsTerminal] = useState(row.isTerminal);
  const [note, setNote] = useState(row.note ?? '');
  const [saving, setSaving] = useState(false);

  const dirty =
    internalState !== row.internalState ||
    isTerminal !== row.isTerminal ||
    (note || null) !== (row.note ?? null);

  const save = async () => {
    setSaving(true);
    try {
      await coliixApi.updateMapping(row.id, {
        internalState,
        isTerminal,
        note: note.trim() || null,
      });
      toast({ kind: 'success', title: t('coliix.mappings.saved') });
      onChanged();
    } catch {
      toast({ kind: 'error', title: t('coliix.mappings.saveFail') });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('coliix.mappings.confirmDelete', { wording: row.rawWording }))) return;
    try {
      await coliixApi.deleteMapping(row.id);
      onChanged();
    } catch {
      toast({ kind: 'error', title: t('coliix.mappings.saveFail') });
    }
  };

  const isUnknown = !row.internalState;
  return (
    <tr
      className={`border-t border-gray-100 ${isUnknown ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-gray-50'}`}
    >
      <td className="px-4 py-1.5 font-semibold text-gray-800">
        <div className="flex items-center gap-1.5">
          {isUnknown && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Needs review" />
          )}
          {row.rawWording}
        </div>
      </td>
      <td className="px-4 py-1.5">
        <select
          value={internalState ?? ''}
          onChange={(e) => setInternalState((e.target.value || null) as ShipmentState | null)}
          className="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-gray-200 focus:border-primary focus:outline-none"
        >
          <option value="">{t('coliix.mappings.unmapped')}</option>
          {ASSIGNABLE_SHIPMENT_STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-1.5">
        <input
          type="checkbox"
          checked={isTerminal}
          onChange={(e) => setIsTerminal(e.target.checked)}
          className="h-3 w-3"
        />
      </td>
      <td className="px-4 py-1.5 text-right text-gray-500">
        {row.usageShipments > 0 ? (
          <span title={`${row.usageEvents} events`} className="font-mono text-[11px]">
            {row.usageShipments}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-1.5">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="—"
          className="w-32 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] hover:border-gray-200 focus:border-primary focus:outline-none"
        />
      </td>
      <td className="px-4 py-1.5">
        <div className="flex justify-end gap-1">
          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
              title={t('common.save') as string}
            >
              <Save size={12} />
            </button>
          )}
          <button
            onClick={remove}
            className="rounded p-1 text-red-500 hover:bg-red-50"
            title={t('common.delete') as string}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Add manual mapping ─────────────────────────────────────────────────────

function AddMappingForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.push);
  const [wording, setWording] = useState('');
  const [internalState, setInternalState] = useState<ShipmentState | null>(null);
  const [isTerminal, setIsTerminal] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!wording.trim()) {
      toast({ kind: 'error', title: t('coliix.mappings.errWording') });
      return;
    }
    setSaving(true);
    try {
      await coliixApi.createMapping({
        rawWording: wording.trim(),
        internalState,
        isTerminal,
        note: note.trim() || null,
      });
      toast({ kind: 'success', title: t('coliix.mappings.created') });
      onCreated();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast({
        kind: 'error',
        title: e.response?.data?.error?.message ?? t('coliix.mappings.saveFail'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-800">{t('coliix.mappings.addTitle')}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            {t('coliix.mappings.colWording')}
          </label>
          <input
            type="text"
            value={wording}
            onChange={(e) => setWording(e.target.value)}
            placeholder='e.g. "Livré"'
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            {t('coliix.mappings.colMapsTo')}
          </label>
          <select
            value={internalState ?? ''}
            onChange={(e) => setInternalState((e.target.value || null) as ShipmentState | null)}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">{t('coliix.mappings.unmapped')}</option>
            {ASSIGNABLE_SHIPMENT_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={isTerminal}
              onChange={(e) => setIsTerminal(e.target.checked)}
            />
            {t('coliix.mappings.colTerminal')}
          </label>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            {t('coliix.mappings.colNote')}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <CRMButton variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          {t('common.cancel')}
        </CRMButton>
        <CRMButton variant="primary" size="sm" onClick={save} loading={saving}>
          {t('common.create')}
        </CRMButton>
      </div>
    </GlassCard>
  );
}
