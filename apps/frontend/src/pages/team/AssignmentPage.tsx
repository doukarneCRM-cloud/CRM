import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Power, Shuffle, Package, Users, AlertTriangle } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  teamApi,
  type AssignmentCandidate,
  type AssignmentRuleState,
  type CommissionRule,
  type TeamUser,
} from '@/services/teamApi';
import { cn } from '@/lib/cn';
import { getSocket } from '@/services/socket';

import { TeamTabs } from './components/TeamTabs';
import { CommissionTable } from './components/CommissionTable';

export default function AssignmentPage() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.TEAM_MANAGE_ROLES);

  const strategies: { value: AssignmentRuleState['strategy']; label: string; help: string; icon: React.ElementType }[] = useMemo(
    () => [
      {
        value: 'round_robin',
        label: t('team.assignment.strategy.roundRobin'),
        help: t('team.assignment.strategy.roundRobinHelp'),
        icon: Shuffle,
      },
      {
        value: 'by_product',
        label: t('team.assignment.strategy.byProduct'),
        help: t('team.assignment.strategy.byProductHelp'),
        icon: Package,
      },
    ],
    [t],
  );

  const [rule, setRule] = useState<AssignmentRuleState | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [candidates, setCandidates] = useState<AssignmentCandidate[]>([]);
  const [commission, setCommission] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [simulationCount, setSimulationCount] = useState(5);
  const [simulationResult, setSimulationResult] = useState<string[] | null>(null);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u, c, cand] = await Promise.all([
        teamApi.getAssignmentRule(),
        teamApi.listUsers(),
        teamApi.listCommission(),
        teamApi.listAssignmentCandidates(),
      ]);
      setRule(r);
      setUsers(u);
      setCommission(c);
      setCandidates(cand);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live: another admin tweaks the rule, or a user/role changes (which
  // affects the eligible-agent picker), or commission rates move. Reload
  // so this admin's view stays consistent with the database.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }
    const refresh = () => {
      void load();
    };
    socket.on('assignment_rule:updated', refresh);
    socket.on('user:created', refresh);
    socket.on('user:updated', refresh);
    socket.on('role:updated', refresh);
    return () => {
      socket?.off('assignment_rule:updated', refresh);
      socket?.off('user:created', refresh);
      socket?.off('user:updated', refresh);
      socket?.off('role:updated', refresh);
    };
  }, [load]);

  const patchRule = async (patch: Partial<AssignmentRuleState>) => {
    if (!rule) return;
    setSaving(true);
    setRule({ ...rule, ...patch });
    try {
      const next = await teamApi.updateAssignmentRule(patch);
      setRule(next);
    } catch {
      // Rollback on failure
      setRule(rule);
      window.alert(t('team.assignment.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const runSimulation = async () => {
    setSimulating(true);
    try {
      const { sequence } = await teamApi.simulateAssignment(simulationCount);
      setSimulationResult(sequence);
    } catch {
      setSimulationResult(null);
    } finally {
      setSimulating(false);
    }
  };

  if (loading || !rule) {
    return (
      <div className="flex h-full flex-col">
        <TeamTabs />
        <div className="flex flex-col gap-4 p-6">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-40 rounded-card" />
          <div className="skeleton h-40 rounded-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TeamTabs />

      <div className="flex flex-col gap-4 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-primary">{t('team.assignment.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('team.assignment.subtitle')}
          </p>
        </div>

        {/* Master toggle */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-gray-100 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('team.assignment.master.title')}</h3>
            <p className="text-xs text-gray-500">
              {t('team.assignment.master.subtitle')}
            </p>
          </div>
          <button
            onClick={() => canManage && patchRule({ isActive: !rule.isActive })}
            disabled={!canManage || saving}
            className={cn(
              'flex h-9 items-center gap-2 rounded-btn px-4 text-sm font-semibold transition-colors',
              rule.isActive
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              (!canManage || saving) && 'cursor-not-allowed opacity-70',
            )}
          >
            <Power size={14} />
            {rule.isActive ? t('team.assignment.master.enabled') : t('team.assignment.master.disabled')}
          </button>
        </section>

        {/* Strategy */}
        <section className="rounded-card border border-gray-100 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('team.assignment.strategy.title')}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {t('team.assignment.strategy.subtitle')}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {strategies.map(({ value, label, help, icon: Icon }) => {
              const active = rule.strategy === value;
              return (
                <button
                  key={value}
                  onClick={() => canManage && patchRule({ strategy: value })}
                  disabled={!canManage || saving}
                  className={cn(
                    'flex items-start gap-3 rounded-card border p-3 text-left transition-colors',
                    active
                      ? 'border-primary bg-accent/60 ring-2 ring-primary/30'
                      : 'border-gray-100 bg-white hover:border-primary/40',
                    (!canManage || saving) && 'cursor-not-allowed opacity-70',
                  )}
                >
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-btn',
                    active ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500',
                  )}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{label}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">{help}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Eligible agents picker */}
        <section className="rounded-card border border-gray-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{t('team.assignment.eligible.title')}</h3>
              <p className="mt-1 text-xs text-gray-500">
                {t('team.assignment.eligible.subtitle')}
              </p>
            </div>
            {canManage && candidates.length > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => patchRule({ eligibleAgentIds: [] })}
                  disabled={saving}
                  className="rounded-btn px-2 py-1 font-semibold text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('team.assignment.eligible.selectAll')}
                </button>
                <span className="text-gray-300">·</span>
                <button
                  type="button"
                  onClick={() =>
                    patchRule({ eligibleAgentIds: candidates.map((c) => c.id) })
                  }
                  disabled={saving}
                  className="rounded-btn px-2 py-1 font-semibold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('team.assignment.eligible.lockCurrent')}
                </button>
              </div>
            )}
          </div>

          {candidates.length === 0 ? (
            <div className="mt-3 rounded-btn bg-gray-50 px-3 py-3 text-xs text-gray-500">
              {t('team.assignment.eligible.empty')}
            </div>
          ) : (
            <>
              {(() => {
                // Empty allowlist = "everyone with confirmation:view" (back-
                // compat). Render all candidates as checked in that mode so
                // the picker reflects the actual rotation.
                const allowAll = rule.eligibleAgentIds.length === 0;
                const selected = new Set(rule.eligibleAgentIds);
                const isChecked = (id: string) => allowAll || selected.has(id);
                const toggle = (id: string) => {
                  const base = allowAll
                    ? candidates.map((c) => c.id)
                    : Array.from(selected);
                  const next = base.includes(id)
                    ? base.filter((x) => x !== id)
                    : [...base, id];
                  patchRule({ eligibleAgentIds: next });
                };
                const checkedCount = allowAll
                  ? candidates.length
                  : candidates.filter((c) => selected.has(c.id)).length;
                const noneSelected = !allowAll && checkedCount === 0;

                return (
                  <>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {candidates.map((c) => {
                        const checked = isChecked(c.id);
                        const inactive = !c.isActive;
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              'flex items-center gap-2 rounded-btn border px-3 py-2 transition-colors',
                              checked
                                ? 'border-primary/40 bg-accent/40'
                                : 'border-gray-100 bg-white hover:border-gray-200',
                              (!canManage || saving) && 'cursor-not-allowed opacity-70',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canManage || saving}
                              onChange={() => canManage && toggle(c.id)}
                              className="h-4 w-4 accent-primary"
                            />
                            <Users size={14} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-900">{c.name}</span>
                            {inactive && (
                              <span className="ml-auto rounded-badge bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                {t('team.assignment.eligible.userInactive')}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>

                    <p className="mt-2 text-[11px] text-gray-500">
                      {allowAll
                        ? t('team.assignment.eligible.statusAll', { count: candidates.length })
                        : t('team.assignment.eligible.statusCount', { count: checkedCount, total: candidates.length })}
                    </p>

                    {noneSelected && (
                      <div className="mt-3 flex items-start gap-2 rounded-btn bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>{t('team.assignment.eligible.warnNone')}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </section>

        {/* Bounce count */}
        <section className="rounded-card border border-gray-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{t('team.assignment.bounce.title')}</h3>
              <p className="mt-1 text-xs text-gray-500">
                {t('team.assignment.bounce.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={10}
                value={rule.bounceCount}
                disabled={!canManage || saving}
                onChange={(e) => canManage && patchRule({ bounceCount: Number(e.target.value) })}
                className="w-48 accent-primary disabled:cursor-not-allowed"
              />
              <span className="flex h-8 min-w-[40px] items-center justify-center rounded-btn bg-primary px-3 text-sm font-bold text-white">
                {rule.bounceCount}
              </span>
            </div>
          </div>
        </section>

        {/* Simulator */}
        <section className="rounded-card border border-gray-100 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('team.assignment.simulator.title')}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {t('team.assignment.simulator.subtitle')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              {t('team.assignment.simulator.orders')}
              <input
                type="number"
                min={1}
                max={50}
                value={simulationCount}
                onChange={(e) => setSimulationCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="w-20 rounded-input border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <CRMButton
              size="sm"
              leftIcon={<Play size={12} />}
              onClick={runSimulation}
              loading={simulating}
            >
              {t('team.assignment.simulator.simulate')}
            </CRMButton>
          </div>

          {simulationResult && (
            <div className="mt-4 flex flex-wrap gap-2">
              {simulationResult.length === 0 ? (
                <p className="text-xs text-gray-500">
                  {!rule.isActive
                    ? t('team.assignment.simulator.disabled')
                    : t('team.assignment.simulator.empty')}
                </p>
              ) : (
                simulationResult.map((name, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-badge bg-accent/80 px-3 py-1 text-[11px] font-medium text-primary"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                      {i + 1}
                    </span>
                    {name}
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Commission table */}
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('team.assignment.commission.title')}</h3>
            <p className="mt-1 text-xs text-gray-500">
              {t('team.assignment.commission.subtitle')}
            </p>
          </div>
          <CommissionTable
            users={users}
            rules={commission}
            canEdit={canManage}
            onSaved={load}
          />
        </section>
      </div>
    </div>
  );
}
