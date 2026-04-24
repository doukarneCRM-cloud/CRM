import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  CONFIRMATION_STATUS_COLORS,
  type ConfirmationStatus,
} from '@/constants/statusColors';
import { CONFIRMATION_HEX } from '../statusHex';

interface Props {
  breakdown: Record<string, number>;
  loading: boolean;
}

export function ConfirmationDonutChart({ breakdown, loading }: Props) {
  const { t } = useTranslation();
  const { slices, total } = useMemo(() => {
    const entries = Object.entries(breakdown)
      .filter(([, n]) => n > 0)
      .map(([status, count]) => {
        const cfg = CONFIRMATION_STATUS_COLORS[status as ConfirmationStatus];
        return {
          status,
          label: cfg?.label ?? status,
          count,
          color: CONFIRMATION_HEX[status as ConfirmationStatus] ?? '#9CA3AF',
        };
      })
      .sort((a, b) => b.count - a.count);
    const sum = entries.reduce((s, e) => s + e.count, 0);
    return { slices: entries, total: sum };
  }, [breakdown]);

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.confirmationStatus')}</h3>
        <p className="text-[11px] text-gray-400">{t('dashboard.confirmationStatusSub')}</p>
      </div>

      {loading ? (
        <div className="skeleton h-[180px] w-full rounded-xl" />
      ) : total === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          {t('dashboard.noData')}
        </div>
      ) : (
        <>
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {slices.map((s) => (
                    <Cell key={s.status} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #F3F4F6',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wide text-gray-400">{t('common.total')}</span>
              <span className="text-xl font-bold text-gray-900">{total}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {slices.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-[11px]">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate text-gray-600">{s.label}</span>
                </div>
                <span className="shrink-0 font-semibold text-gray-900">{s.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
}
