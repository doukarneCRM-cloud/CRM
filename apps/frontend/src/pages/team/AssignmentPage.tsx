import { useCallback, useEffect, useState } from 'react';
import { Play, Power, Shuffle, Package } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  teamApi,
  type AssignmentRuleState,
  type CommissionRule,
  type TeamUser,
} from '@/services/teamApi';
import { cn } from '@/lib/cn';

import { TeamTabs } from './components/TeamTabs';
import { CommissionTable } from './components/CommissionTable';

const STRATEGIES: { value: AssignmentRuleState['strategy']; label: string; help: string; icon: React.ElementType }[] = [
  {
    value: 'round_robin',
    label: 'Round-robin',
    help: 'Each agent gets the configured number of orders in turn.',
    icon: Shuffle,
  },
  {
    value: 'by_product',
    label: 'By product',
    help: 'Falls back to round-robin until product → agent mapping is configured.',
    icon: Package,
  },
];

export default function AssignmentPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.TEAM_MANAGE_ROLES);

  const [rule, setRule] = useState<AssignmentRuleState | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [commission, setCommission] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [simulationCount, setSimulationCount] = useState(5);
  const [simulationResult, setSimulationResult] = useState<string[] | null>(null);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u, c] = await Promise.all([
        teamApi.getAssignmentRule(),
        teamApi.listUsers(),
        teamApi.listCommission(),
      ]);
      setRule(r);
      setUsers(u);
      setCommission(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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
      window.alert('Failed to save change');
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
          <h1 className="text-2xl font-bold text-primary">Assignment rules</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure how incoming orders are distributed among your confirmation agents.
          </p>
        </div>

        {/* Master toggle */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-gray-100 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Auto-assignment</h3>
            <p className="text-xs text-gray-500">
              When disabled, new orders stay unassigned until a supervisor picks an agent.
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
            {rule.isActive ? 'Enabled' : 'Disabled'}
          </button>
        </section>

        {/* Strategy */}
        <section className="rounded-card border border-gray-100 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Strategy</h3>
          <p className="mt-1 text-xs text-gray-500">
            How to decide who gets the next order.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {STRATEGIES.map(({ value, label, help, icon: Icon }) => {
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

        {/* Bounce count */}
        <section className="rounded-card border border-gray-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Bounce count</h3>
              <p className="mt-1 text-xs text-gray-500">
                How many orders each agent receives before the rotation moves on.
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
          <h3 className="text-sm font-semibold text-gray-900">Preview rotation</h3>
          <p className="mt-1 text-xs text-gray-500">
            Dry-run the current rule against the list of eligible agents. Nothing is saved.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              Orders:
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
              Simulate
            </CRMButton>
          </div>

          {simulationResult && (
            <div className="mt-4 flex flex-wrap gap-2">
              {simulationResult.length === 0 ? (
                <p className="text-xs text-gray-500">No eligible agents to rotate through.</p>
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
            <h3 className="text-sm font-semibold text-gray-900">Commission rates</h3>
            <p className="mt-1 text-xs text-gray-500">
              Per-agent MAD earned on each confirmed and each delivered order. Commission is paid out
              once per order when it delivers.
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
