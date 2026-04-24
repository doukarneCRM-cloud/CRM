import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { AvatarChip } from '@/components/ui/AvatarChip';
import { teamApi, type CommissionRule, type TeamUser } from '@/services/teamApi';
import { cn } from '@/lib/cn';

interface Props {
  users: TeamUser[];
  rules: CommissionRule[];
  canEdit: boolean;
  onSaved: () => void;
}

interface Draft {
  onConfirm: string;
  onDeliver: string;
}

function makeDraft(rule?: CommissionRule): Draft {
  return {
    onConfirm: String(rule?.onConfirm ?? 0),
    onDeliver: String(rule?.onDeliver ?? 0),
  };
}

export function CommissionTable({ users, rules, canEdit, onSaved }: Props) {
  const { t } = useTranslation();
  const byAgent = useMemo(() => {
    const m = new Map<string, CommissionRule>();
    rules.forEach((r) => m.set(r.agentId, r));
    return m;
  }, [rules]);

  const agents = useMemo(
    () => users.filter((u) => u.isActive),
    [users],
  );

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, Draft> = {};
    agents.forEach((a) => {
      next[a.id] = makeDraft(byAgent.get(a.id));
    });
    setDrafts(next);
  }, [agents, byAgent]);

  const isDirty = (agentId: string) => {
    const d = drafts[agentId];
    if (!d) return false;
    const r = byAgent.get(agentId);
    return Number(d.onConfirm) !== (r?.onConfirm ?? 0) || Number(d.onDeliver) !== (r?.onDeliver ?? 0);
  };

  const save = async (agentId: string) => {
    const d = drafts[agentId];
    if (!d) return;
    setSavingId(agentId);
    try {
      await teamApi.upsertCommission(agentId, {
        onConfirm: Number(d.onConfirm) || 0,
        onDeliver: Number(d.onDeliver) || 0,
      });
      onSaved();
    } catch {
      window.alert(t('team.commissionTable.saveFailed'));
    } finally {
      setSavingId(null);
    }
  };

  if (agents.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
        {t('team.commissionTable.empty')}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50/60">
          <tr className="border-b border-gray-100 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <th className="px-4 py-3">{t('team.commissionTable.columns.agent')}</th>
            <th className="px-4 py-3 w-40">{t('team.commissionTable.columns.onConfirm')}</th>
            <th className="px-4 py-3 w-40">{t('team.commissionTable.columns.onDeliver')}</th>
            <th className="px-4 py-3 w-32 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const d = drafts[a.id] ?? makeDraft();
            const dirty = isDirty(a.id);
            return (
              <tr key={a.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3">
                  <AvatarChip
                    name={a.name}
                    subtitle={a.role.label}
                    avatarUrl={a.avatarUrl ?? undefined}
                    size="sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <RateInput
                    value={d.onConfirm}
                    disabled={!canEdit || savingId === a.id}
                    onChange={(v) =>
                      setDrafts((prev) => ({ ...prev, [a.id]: { ...d, onConfirm: v } }))
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <RateInput
                    value={d.onDeliver}
                    disabled={!canEdit || savingId === a.id}
                    onChange={(v) =>
                      setDrafts((prev) => ({ ...prev, [a.id]: { ...d, onDeliver: v } }))
                    }
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  {canEdit && (
                    <button
                      onClick={() => save(a.id)}
                      disabled={!dirty || savingId === a.id}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                        dirty
                          ? 'bg-primary text-white hover:brightness-105'
                          : 'bg-gray-100 text-gray-400',
                      )}
                    >
                      <Save size={11} />
                      {savingId === a.id ? t('team.commissionTable.saving') : t('team.commissionTable.save')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RateInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded-input border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
      />
      <span className="text-[10px] text-gray-400">MAD</span>
    </div>
  );
}
