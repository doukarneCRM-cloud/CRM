import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';
import {
  CONFIRMATION_STATUS_COLORS,
  type ConfirmationStatus,
} from '@/constants/statusColors';

const EVENTS = [
  'order:created',
  'order:assigned',
  'order:confirmed',
  'order:archived',
  'order:updated',
];

const COLUMN_ORDER: ConfirmationStatus[] = [
  'pending',
  'confirmed',
  'callback',
  'unreachable',
  'cancelled',
  'reported',
  'out_of_stock',
  'fake',
];

export function AgentPipelineTable() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.pipelineAgents(filters),
    EVENTS,
    filters,
  );
  const rows = data ?? [];

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-bold text-gray-900">{t('dashboard.pipeline.agentsTitle')}</h3>
      {loading ? (
        <div className="skeleton h-32 w-full rounded-md" />
      ) : rows.length === 0 ? (
        <div className="rounded-md bg-gray-50 px-3 py-6 text-center text-xs italic text-gray-400">
          {t('dashboard.pipeline.noAgents')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                <th className="pb-2 pr-3 font-semibold">{t('dashboard.pipeline.agent')}</th>
                <th className="pb-2 pr-3 font-semibold text-right">
                  {t('dashboard.pipeline.total')}
                </th>
                {COLUMN_ORDER.map((s) => (
                  <th key={s} className="pb-2 pr-3 font-semibold text-right">
                    {CONFIRMATION_STATUS_COLORS[s].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agentId} className="border-t border-gray-100">
                  <td className="py-2 pr-3 font-semibold text-gray-800">{r.name}</td>
                  <td className="py-2 pr-3 text-right font-bold text-gray-900">{r.total}</td>
                  {COLUMN_ORDER.map((s) => {
                    const v = r.byStatus[s] ?? 0;
                    const cfg = CONFIRMATION_STATUS_COLORS[s];
                    return (
                      <td key={s} className="py-2 pr-3 text-right">
                        {v > 0 ? (
                          <span
                            className={`inline-flex min-w-[24px] justify-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}
                          >
                            {v}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
