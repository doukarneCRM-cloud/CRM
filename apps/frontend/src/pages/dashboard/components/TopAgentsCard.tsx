import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { AvatarChip } from '@/components/ui/AvatarChip';
import { CircleProgress } from '@/components/ui/CircleProgress';
import type { DashboardAgent } from '@/services/dashboardApi';

interface Props {
  agents: DashboardAgent[];
  loading: boolean;
}

export function TopAgentsCard({ agents, loading }: Props) {
  const { t } = useTranslation();
  const ranked = [...agents].sort((a, b) => b.confirmationRate - a.confirmationRate).slice(0, 5);

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.topAgents')}</h3>
        <p className="text-[11px] text-gray-400">{t('dashboard.topAgentsSub')}</p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          {t('dashboard.noAgentActivity')}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {ranked.map((a) => (
            <li
              key={a.agentId}
              className="flex items-center gap-3 rounded-card border border-gray-100 bg-white/60 px-3 py-2"
            >
              <AvatarChip
                name={a.agentName}
                subtitle={t('dashboard.agentKpiSubtitle', { confirmed: a.confirmed, delivered: a.delivered })}
                size="sm"
                className="min-w-0 flex-1"
              />
              <div className="flex shrink-0 items-center gap-2">
                <CircleProgress
                  value={a.confirmationRate}
                  color="#16A34A"
                  size={42}
                  strokeWidth={5}
                  label={`${Math.round(a.confirmationRate)}%`}
                />
                <CircleProgress
                  value={a.deliveryRate}
                  color="#18181B"
                  size={42}
                  strokeWidth={5}
                  label={`${Math.round(a.deliveryRate)}%`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
