import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { cn } from '@/lib/cn';
import {
  SHIPPING_STATUS_COLORS,
  SHIPPING_STATUS_OPTIONS,
} from '@/constants/statusColors';
import { useShippingStatusGroups } from '../hooks/useShippingStatusGroups';
import type { ShippingStatusGroup } from '@/services/shippingStatusGroupsApi';

const PRESET_COLORS = [
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#a855f7', // violet
  '#f59e0b', // amber
  '#ef4444', // red
  '#64748b', // slate
];

interface ManageStatusGroupsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ManageStatusGroupsModal({ open, onClose }: ManageStatusGroupsModalProps) {
  const { t } = useTranslation();
  const { groups, loading, error, refresh, create, update, remove, reorder } =
    useShippingStatusGroups();

  // Inline create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string | null>(PRESET_COLORS[0]);
  const [newKeys, setNewKeys] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Per-row edits (only one row "open" at a time keeps the UI calm)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);
  const [editKeys, setEditKeys] = useState<string[]>([]);

  const claimedByOther = useMemo(() => {
    // Map each statusKey -> list of group names already claiming it. Used to
    // surface a soft warning in the chip strip without blocking the operation.
    const map = new Map<string, string[]>();
    for (const g of groups) {
      for (const k of g.statusKeys) {
        const list = map.get(k) ?? [];
        list.push(g.name);
        map.set(k, list);
      }
    }
    return map;
  }, [groups]);

  const resetCreateForm = () => {
    setShowCreate(false);
    setNewName('');
    setNewColor(PRESET_COLORS[0]);
    setNewKeys([]);
    setFormError(null);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setFormError(t('callCenter.groups.errorNameRequired'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await create({ name, color: newColor, statusKeys: newKeys });
      resetCreateForm();
    } catch (e) {
      const code = (e as { response?: { status?: number } })?.response?.status;
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? null;
      if (code === 409) {
        setFormError(t('callCenter.groups.errorNameTaken'));
      } else {
        setFormError(msg ?? t('callCenter.groups.errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (g: ShippingStatusGroup) => {
    setEditingId(g.id);
    setEditName(g.name);
    setEditColor(g.color);
    setEditKeys(g.statusKeys);
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor(null);
    setEditKeys([]);
    setFormError(null);
  };

  const handleSaveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) {
      setFormError(t('callCenter.groups.errorNameRequired'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await update(id, { name, color: editColor, statusKeys: editKeys });
      cancelEdit();
    } catch (e) {
      const code = (e as { response?: { status?: number } })?.response?.status;
      if (code === 409) {
        setFormError(t('callCenter.groups.errorNameTaken'));
      } else {
        setFormError(t('callCenter.groups.errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (g: ShippingStatusGroup) => {
    const ok = window.confirm(
      t('callCenter.groups.deleteConfirmBody', { name: g.name }),
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      await remove(g.id);
      if (editingId === g.id) cancelEdit();
    } finally {
      setSubmitting(false);
    }
  };

  const moveGroup = async (index: number, dir: -1 | 1) => {
    const next = [...groups];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setSubmitting(true);
    try {
      await reorder(next.map((g) => g.id));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleKey = (
    keys: string[],
    setKeys: (next: string[]) => void,
    key: string,
  ) => {
    if (keys.includes(key)) {
      setKeys(keys.filter((k) => k !== key));
    } else {
      setKeys([...keys, key]);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('callCenter.groups.manageTitle')}
      size="2xl"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}{' '}
            <button
              type="button"
              onClick={() => void refresh()}
              className="ml-2 font-semibold underline"
            >
              {t('callCenter.groups.retry')}
            </button>
          </div>
        )}

        {/* Create form / button */}
        {!showCreate ? (
          <CRMButton
            variant="primary"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setShowCreate(true)}
          >
            {t('callCenter.groups.createCta')}
          </CRMButton>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white/70 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {t('callCenter.groups.create')}
              </h3>
              <button
                type="button"
                onClick={resetCreateForm}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  {t('callCenter.groups.name')}
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('callCenter.groups.namePlaceholder') as string}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  maxLength={50}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  {t('callCenter.groups.color')}
                </label>
                <ColorPicker value={newColor} onChange={setNewColor} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                {t('callCenter.groups.statuses')}
              </label>
              <StatusChipPicker
                selected={newKeys}
                onToggle={(k) => toggleKey(newKeys, setNewKeys, k)}
                claimedByOther={claimedByOther}
                ownGroupName={null}
              />
            </div>

            {formError && (
              <div className="text-xs font-semibold text-red-600">{formError}</div>
            )}

            <div className="flex justify-end gap-2">
              <CRMButton variant="ghost" size="sm" onClick={resetCreateForm}>
                {t('callCenter.groups.cancel')}
              </CRMButton>
              <CRMButton
                variant="primary"
                size="sm"
                loading={submitting}
                onClick={() => void handleCreate()}
              >
                {t('callCenter.groups.save')}
              </CRMButton>
            </div>
          </div>
        )}

        {/* Existing groups list */}
        <div className="space-y-2">
          {loading && groups.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-200 bg-white/50 px-3 py-6 text-center text-xs text-gray-500">
              {t('callCenter.groups.loading')}
            </div>
          )}

          {!loading && groups.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-200 bg-white/50 px-3 py-6 text-center text-xs text-gray-500">
              {t('callCenter.groups.noGroupsHelp')}
            </div>
          )}

          {groups.map((g, idx) => {
            const isEditing = editingId === g.id;
            return (
              <div
                key={g.id}
                className="rounded-lg border border-gray-200 bg-white/70 p-3"
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">
                          {t('callCenter.groups.name')}
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                          maxLength={50}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">
                          {t('callCenter.groups.color')}
                        </label>
                        <ColorPicker value={editColor} onChange={setEditColor} />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-600">
                        {t('callCenter.groups.statuses')}
                      </label>
                      <StatusChipPicker
                        selected={editKeys}
                        onToggle={(k) => toggleKey(editKeys, setEditKeys, k)}
                        claimedByOther={claimedByOther}
                        ownGroupName={g.name}
                      />
                    </div>
                    {formError && (
                      <div className="text-xs font-semibold text-red-600">{formError}</div>
                    )}
                    <div className="flex justify-end gap-2">
                      <CRMButton variant="ghost" size="sm" onClick={cancelEdit}>
                        {t('callCenter.groups.cancel')}
                      </CRMButton>
                      <CRMButton
                        variant="primary"
                        size="sm"
                        loading={submitting}
                        onClick={() => void handleSaveEdit(g.id)}
                      >
                        {t('callCenter.groups.save')}
                      </CRMButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-1 items-start gap-3">
                      <div className="flex flex-col gap-1 pt-0.5">
                        <button
                          type="button"
                          aria-label={t('callCenter.groups.moveUp') as string}
                          disabled={idx === 0 || submitting}
                          onClick={() => void moveGroup(idx, -1)}
                          className={cn(
                            'rounded-md p-1 text-gray-500 hover:bg-gray-100',
                            (idx === 0 || submitting) && 'opacity-30 cursor-not-allowed',
                          )}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={t('callCenter.groups.moveDown') as string}
                          disabled={idx === groups.length - 1 || submitting}
                          onClick={() => void moveGroup(idx, 1)}
                          className={cn(
                            'rounded-md p-1 text-gray-500 hover:bg-gray-100',
                            (idx === groups.length - 1 || submitting) &&
                              'opacity-30 cursor-not-allowed',
                          )}
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {g.color && (
                            <span
                              className="h-3 w-3 rounded-full ring-1 ring-black/10"
                              style={{ backgroundColor: g.color }}
                            />
                          )}
                          <span className="text-sm font-semibold text-gray-800">
                            {g.name}
                          </span>
                          <span className="text-xs text-gray-400">
                            ·{' '}
                            {t('callCenter.groups.statusCount', { count: g.statusKeys.length })}
                          </span>
                        </div>
                        {g.statusKeys.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {g.statusKeys.map((k) => {
                              const cfg = SHIPPING_STATUS_COLORS[
                                k as keyof typeof SHIPPING_STATUS_COLORS
                              ];
                              if (!cfg) {
                                return (
                                  <span
                                    key={k}
                                    className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500"
                                  >
                                    {k}
                                  </span>
                                );
                              }
                              return (
                                <span
                                  key={k}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                    cfg.bg,
                                    cfg.text,
                                  )}
                                >
                                  <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                                  {cfg.label}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] italic text-gray-400">
                            {t('callCenter.groups.noStatusesAssigned')}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <CRMButton variant="secondary" size="sm" onClick={() => startEdit(g)}>
                        {t('callCenter.groups.edit')}
                      </CRMButton>
                      <CRMButton
                        variant="danger"
                        size="sm"
                        leftIcon={<Trash2 size={12} />}
                        onClick={() => void handleDelete(g)}
                      >
                        {t('callCenter.groups.delete')}
                      </CRMButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          'h-7 w-7 rounded-full border bg-white text-[10px] font-bold text-gray-400',
          value === null ? 'border-primary ring-2 ring-primary/30' : 'border-gray-200',
        )}
        title="None"
      >
        ×
      </button>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'h-7 w-7 rounded-full ring-1 ring-black/10 transition',
            value === c && 'ring-2 ring-primary ring-offset-2',
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function StatusChipPicker({
  selected,
  onToggle,
  claimedByOther,
  ownGroupName,
}: {
  selected: string[];
  onToggle: (key: string) => void;
  claimedByOther: Map<string, string[]>;
  ownGroupName: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {SHIPPING_STATUS_OPTIONS.map((opt) => {
        const cfg = SHIPPING_STATUS_COLORS[opt.value];
        const active = selected.includes(opt.value);
        // "Claimed elsewhere" = some OTHER group already lists this status. We
        // show a soft warning (not a block) since transitional states are a
        // legit reason to overlap.
        const claimers = (claimedByOther.get(opt.value) ?? []).filter(
          (n) => n !== ownGroupName,
        );
        const warning = !active && claimers.length > 0;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            title={
              warning
                ? (t('callCenter.groups.groupAlreadyClaims', {
                    groups: claimers.join(', '),
                  }) as string)
                : undefined
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
              active
                ? cn(cfg.bg, cfg.text, 'border-current shadow-sm')
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
              warning && 'ring-1 ring-amber-300',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
            {warning && (
              <span className="rounded-full bg-amber-100 px-1.5 py-[1px] text-[9px] font-bold text-amber-700">
                {t('callCenter.groups.claimedShort')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
