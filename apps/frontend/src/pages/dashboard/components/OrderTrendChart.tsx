import { useMemo, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { cn } from '@/lib/cn';
import type { DashboardTrendPoint } from '@/services/dashboardApi';

interface Props {
  data: DashboardTrendPoint[];
  loading: boolean;
}

// Dot-matrix trend: each day = vertical stack of dots sized to its volume
// relative to the max day in the range. Inspired by LoopAI activity charts.
export function OrderTrendChart({ data, loading }: Props) {
  const [hover, setHover] = useState<DashboardTrendPoint | null>(null);

  const { max, normalized } = useMemo(() => {
    const maxVal = Math.max(1, ...data.map((d) => d.count));
    const dotsPerDay = 8; // matrix height
    return {
      max: maxVal,
      normalized: data.map((d) => ({
        ...d,
        filledDots: Math.round((d.count / maxVal) * dotsPerDay),
        totalDots: dotsPerDay,
      })),
    };
  }, [data]);

  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Order Trend</h3>
          <p className="text-[11px] text-gray-400">Volume per day</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Peak</p>
          <p className="text-sm font-bold text-primary">{max}</p>
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-[120px] w-full rounded-xl" />
      ) : data.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-gray-400">
          No orders in range
        </div>
      ) : (
        <div className="relative">
          <div className="flex h-[120px] items-end gap-1 overflow-x-auto pb-2">
            {normalized.map((d) => (
              <button
                key={d.date}
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
                className={cn(
                  'flex w-4 shrink-0 flex-col-reverse gap-0.5 rounded-md p-0.5 transition-colors',
                  hover?.date === d.date && 'bg-primary/5',
                )}
                title={`${d.date}: ${d.count} order${d.count !== 1 ? 's' : ''}`}
              >
                {Array.from({ length: d.totalDots }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-2 w-2 rounded-full transition-all',
                      i < d.filledDots ? 'bg-primary' : 'bg-primary/10',
                    )}
                  />
                ))}
              </button>
            ))}
          </div>

          {hover && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-badge bg-gray-900 px-2 py-1 text-[10px] font-semibold text-white shadow-lg">
              {new Date(hover.date).toLocaleDateString('fr-MA', {
                day: '2-digit',
                month: 'short',
              })}{' '}
              · {hover.count}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
