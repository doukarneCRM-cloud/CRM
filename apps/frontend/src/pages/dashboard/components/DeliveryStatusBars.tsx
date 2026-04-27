import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { SHIPPING_STATUS_COLORS, type ShippingStatus } from '@/constants/statusColors';
import { SHIPPING_HEX } from '../statusHex';

interface Props {
  breakdown: Record<string, number>;
  loading: boolean;
}

// The breakdown is now keyed by Coliix's literal wording (Ramassé, Livré, …)
// so the legacy SHIPPING_HEX/STATUS_COLORS lookups miss for everything
// except a couple of synthetic buckets. Hash each unique wording into a
// stable colour so bars are visually distinct without a code change every
// time Coliix introduces a new state name.
const PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6366F1',
  '#14B8A6', '#A855F7',
];
function hashColor(s: string): string {
  if (s === 'Not Shipped') return '#9CA3AF';
  if (s === 'Label Created') return '#3B82F6';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

export function DeliveryStatusBars({ breakdown, loading }: Props) {
  const { t } = useTranslation();
  const { rows, max } = useMemo(() => {
    const entries = Object.entries(breakdown)
      .filter(([, n]) => n > 0)
      .map(([status, count]) => {
        const cfg = SHIPPING_STATUS_COLORS[status as ShippingStatus];
        const legacyColor = SHIPPING_HEX[status as ShippingStatus];
        return {
          status,
          label: cfg?.label ?? status,
          count,
          color: legacyColor ?? hashColor(status),
        };
      })
      .sort((a, b) => b.count - a.count);
    return { rows: entries, max: Math.max(1, ...entries.map((e) => e.count)) };
  }, [breakdown]);

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.deliveryStatus')}</h3>
        <p className="text-[11px] text-gray-400">{t('dashboard.deliveryStatusSub')}</p>
      </div>

      {loading ? (
        <div className="skeleton h-[180px] w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          {t('dashboard.noShippingData')}
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
