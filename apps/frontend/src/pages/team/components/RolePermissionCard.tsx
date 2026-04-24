import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Lock, Save, Undo2 } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { teamApi, type RoleDetail, type PermissionOption } from '@/services/teamApi';
import { cn } from '@/lib/cn';

const ROLE_COLORS: Record<string, string> = {
  admin:      'from-purple-400 to-fuchsia-500',
  supervisor: 'from-blue-400 to-indigo-500',
  agent:      'from-emerald-400 to-teal-500',
  shipping:   'from-amber-400 to-orange-500',
  atelie:     'from-pink-400 to-rose-500',
};

// Permission key prefix → section label (keeps perms grouped in a sane order)
const SECTION_ORDER = [
  'orders', 'confirmation', 'shipping', 'call_center',
  'products', 'stock', 'clients', 'team', 'dashboard',
  'analytics', 'integrations', 'atelie', 'settings',
] as const;

function sectionKey(permKey: string) {
  return permKey.split(':')[0];
}

interface Props {
  role: RoleDetail;
  permissions: PermissionOption[];
  canEdit: boolean;
  onSaved: () => void;
}

export function RolePermissionCard({ role, permissions, canEdit, onSaved }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role.permissionKeys));
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => {
    if (selected.size !== role.permissionKeys.length) return true;
    for (const k of role.permissionKeys) if (!selected.has(k)) return true;
    return false;
  }, [selected, role.permissionKeys]);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    for (const p of permissions) {
      const sec = sectionKey(p.key);
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(p);
    }
    const ordered: { section: string; perms: PermissionOption[] }[] = [];
    for (const s of SECTION_ORDER) {
      const perms = map.get(s);
      if (perms) ordered.push({ section: s, perms });
    }
    // Append any sections not in the canonical order (forward-compat)
    for (const [s, perms] of map) {
      if (!SECTION_ORDER.includes(s as typeof SECTION_ORDER[number])) {
        ordered.push({ section: s, perms });
      }
    }
    return ordered;
  }, [permissions]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSection = (perms: PermissionOption[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = perms.every((p) => next.has(p.key));
      if (allSelected) perms.forEach((p) => next.delete(p.key));
      else perms.forEach((p) => next.add(p.key));
      return next;
    });
  };

  const revert = () => setSelected(new Set(role.permissionKeys));

  const save = async () => {
    if (role.isSystem && selected.size === 0) {
      window.alert(t('team.rolePermissionCard.adminMustKeep'));
      return;
    }
    setSaving(true);
    try {
      await teamApi.updateRole(role.id, { permissionKeys: Array.from(selected) });
      onSaved();
    } catch {
      window.alert(t('team.rolePermissionCard.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const gradient = ROLE_COLORS[role.name] ?? 'from-gray-400 to-gray-500';

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-gray-100 bg-white">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-gradient-to-br text-sm font-bold text-white shadow-sm',
            gradient,
          )}
        >
          {role.label[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-gray-900">{role.label}</p>
            {role.isSystem && (
              <span className="flex items-center gap-1 rounded-badge bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                <Lock size={9} /> {t('team.rolePermissionCard.system')}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-gray-400">
            {t('team.rolePermissionCard.userCount', { count: role.userCount })} · {t('team.rolePermissionCard.permissionCount', { count: role.permissionKeys.length })}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-gray-400 transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {/* Permission matrix */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/40 p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {grouped.map(({ section, perms }) => {
              const allOn = perms.every((p) => selected.has(p.key));
              const label = t(`team.rolePermissionCard.sections.${section}`, { defaultValue: section });
              return (
                <div key={section} className="rounded-input border border-gray-100 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      {label}
                    </h4>
                    {canEdit && (
                      <button
                        onClick={() => toggleSection(perms)}
                        className="text-[10px] font-medium text-primary hover:underline"
                      >
                        {allOn ? t('team.rolePermissionCard.clearAll') : t('team.rolePermissionCard.selectAll')}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {perms.map((p) => (
                      <label
                        key={p.key}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700',
                          canEdit ? 'cursor-pointer hover:bg-accent/50' : 'cursor-not-allowed opacity-70',
                        )}
                      >
                        <input
                          type="checkbox"
                          disabled={!canEdit}
                          checked={selected.has(p.key)}
                          onChange={() => toggle(p.key)}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        <span className="flex-1 truncate">{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {canEdit && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <CRMButton
                variant="ghost"
                size="sm"
                onClick={revert}
                disabled={!dirty || saving}
                leftIcon={<Undo2 size={12} />}
              >
                {t('team.rolePermissionCard.revert')}
              </CRMButton>
              <CRMButton
                size="sm"
                onClick={save}
                disabled={!dirty}
                loading={saving}
                leftIcon={<Save size={12} />}
              >
                {t('team.rolePermissionCard.savePermissions')}
              </CRMButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
