import { LucideIcon } from 'lucide-react';
import { GlassCard, type GlassTone } from './GlassCard';
import { TrendBadge } from './TrendBadge';
import { cn } from '@/lib/cn';

interface SparklinePoint {
  value: number;
}

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  percentageChange?: number;
  icon?: LucideIcon;
  iconColor?: string;
  sparklineData?: SparklinePoint[];
  className?: string;
  // Soft pastel gradient + tinted icon bg, matching the dashboard
  // reference look. Falls back to the previous neutral look when unset.
  tone?: GlassTone;
}

// Maps a GlassTone → the Tailwind classes the icon tile + accent stroke
// should pull from. Keeps the component composable: caller picks the tone
// once on KPICard, the icon + sparkline + accent inherit it.
const toneAccent: Record<GlassTone, { iconBg: string; iconText: string; ring: string }> = {
  lavender: { iconBg: 'bg-tone-lavender-100', iconText: 'text-tone-lavender-500', ring: 'ring-tone-lavender-100' },
  peach:    { iconBg: 'bg-tone-peach-100',    iconText: 'text-tone-peach-500',    ring: 'ring-tone-peach-100' },
  mint:     { iconBg: 'bg-tone-mint-100',     iconText: 'text-tone-mint-500',     ring: 'ring-tone-mint-100' },
  sky:      { iconBg: 'bg-tone-sky-100',      iconText: 'text-tone-sky-500',      ring: 'ring-tone-sky-100' },
  rose:     { iconBg: 'bg-tone-rose-100',     iconText: 'text-tone-rose-500',     ring: 'ring-tone-rose-100' },
  amber:    { iconBg: 'bg-tone-amber-100',    iconText: 'text-tone-amber-500',    ring: 'ring-tone-amber-100' },
};

// Mini inline sparkline using SVG
function MiniSparkline({ data }: { data: SparklinePoint[] }) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 80;
  const height = 32;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d.value - min) / range) * height;
    return `${x},${y}`;
  });

  const polyline = points.join(' ');

  const isPositive = values[values.length - 1] >= values[0];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-70">
      <defs>
        <linearGradient id="spark-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isPositive ? '#22C55E' : '#EF4444'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? '#22C55E' : '#EF4444'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={polyline}
        fill="none"
        stroke={isPositive ? '#22C55E' : '#EF4444'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const KPICard = ({
  title,
  value,
  unit,
  subtitle,
  percentageChange,
  icon: Icon,
  iconColor = '#18181B',
  sparklineData,
  className,
  tone,
}: KPICardProps) => {
  // When a tone is supplied, pull the icon-bg/icon-color from the
  // coordinated palette so the card reads as one piece. Without a tone
  // we fall back to the legacy `iconColor` prop (alpha-blended bg) so
  // existing call sites keep working without churn.
  const accent = tone ? toneAccent[tone] : null;

  return (
    <GlassCard
      lift
      tone={tone}
      className={cn('relative flex flex-col gap-3.5', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </span>
        {Icon && (
          accent ? (
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', accent.iconBg)}>
              <Icon size={18} className={accent.iconText} strokeWidth={2.4} />
            </div>
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${iconColor}18` }}
            >
              <Icon size={18} style={{ color: iconColor }} strokeWidth={2.4} />
            </div>
          )
        )}
      </div>

      {/* Value — bigger + tighter line height so the number is the focal
          point on the card, like the references. */}
      <div className="flex items-end gap-2">
        <span className="text-[34px] font-bold leading-[1] tracking-tight text-gray-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span className="mb-1 text-sm font-medium text-gray-400">{unit}</span>}
      </div>
      {subtitle && <span className="-mt-0.5 text-[11px] text-gray-500">{subtitle}</span>}

      {/* Footer — only renders when there's a trend or sparkline to show.
          Removes the empty-row gap on cards that have neither. */}
      {(percentageChange !== undefined || (sparklineData && sparklineData.length > 1)) && (
        <div className="flex items-center justify-between">
          {percentageChange !== undefined ? (
            <TrendBadge value={percentageChange} size="sm" />
          ) : (
            <span />
          )}
          {sparklineData && sparklineData.length > 1 && (
            <MiniSparkline data={sparklineData} />
          )}
        </div>
      )}
    </GlassCard>
  );
};

export { KPICard };
