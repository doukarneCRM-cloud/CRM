import { useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { SHIPPING_STATUS_COLORS, type ShippingStatus } from '@/constants/statusColors';
import { SHIPPING_HEX } from '../statusHex';

interface Props {
  breakdown: Record<string, number>;
  loading: boolean;
}

export function DeliveryStatusBars({ breakdown, loading }: Props) {
  const { rows, max } = useMemo(() => {
    const entries = Object.entries(breakdown)
      .filter(([, n]) => n > 0)
      .map(([status, count]) => {
        const cfg = SHIPPING_STATUS_COLORS[status as ShippingStatus];
        return {
          status,
          label: cfg?.label ?? status,
          count,
          color: SHIPPING_HEX[status as ShippingStatus] ?? '#9CA3AF',
        };
      })
      .sort((a, b) => b.count - a.count);
    return { rows: entries, max: Math.max(1, ...entries.map((e) => e.count)) };
  }, [breakdown]);

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Delivery Status</h3>
        <p className="text-[11px] text-gray-400">Orders by shipping state</p>
      </div>

      {loading ? (
        <div className="skeleton h-[180px] w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          No shipping data
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const width = (r.count / max) * 100;
            return (
              <div key={r.status} className="flex items-center gap-2">
                <div className="w-28 shrink-0 text-[11px] font-medium text-gray-600">
                  {r.label}
                </div>
                <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${width}%`, backgroundColor: r.color }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-bold text-gray-900">
                  {r.count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
