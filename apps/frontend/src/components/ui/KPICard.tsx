import { LucideIcon } from 'lucide-react';
import { GlassCard } from './GlassCard';
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
}

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
  iconColor = '#6B4226',
  sparklineData,
  className,
}: KPICardProps) => {
  return (
    <GlassCard lift className={cn('relative flex flex-col gap-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        {Icon && (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-btn"
            style={{ backgroundColor: `${iconColor}15` }}
          >
            <Icon size={18} style={{ color: iconColor }} />
          </div>
        )}
      </div>

      {/* Value */}
      <div className="flex items-end gap-2">
        <span className="text-[32px] font-bold leading-none text-gray-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span className="mb-1 text-sm font-medium text-gray-400">{unit}</span>}
      </div>
      {subtitle && <span className="-mt-1 text-[11px] text-gray-400">{subtitle}</span>}

      {/* Footer */}
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
    </GlassCard>
  );
};

export { KPICard };
