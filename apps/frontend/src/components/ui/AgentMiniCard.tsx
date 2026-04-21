import { GlassCard } from './GlassCard';
import { TrendBadge } from './TrendBadge';
import { CircleProgress } from './CircleProgress';
import { cn } from '@/lib/cn';

interface AgentMiniCardProps {
  name: string;
  avatarUrl?: string;
  kpiValue: number;
  kpiLabel: string;
  progressValue: number; // 0–100
  progressColor?: string;
  percentageChange?: number;
  className?: string;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
];

const AgentMiniCard = ({
  name,
  avatarUrl,
  kpiValue,
  kpiLabel,
  progressValue,
  progressColor = '#3C2515',
  percentageChange,
  className,
}: AgentMiniCardProps) => {
  const colorIdx =
    name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;

  return (
    <GlassCard padding="sm" className={cn('flex items-center gap-3', className)}>
      {/* Progress ring with avatar inside */}
      <div className="relative flex-shrink-0">
        <CircleProgress
          value={progressValue}
          color={progressColor}
          size={56}
          strokeWidth={5}
        />
        {/* Avatar inside ring */}
        <div className="absolute inset-0 flex items-center justify-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold',
                AVATAR_COLORS[colorIdx],
              )}
            >
              {getInitials(name)}
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
        <p className="text-[11px] text-gray-400">{kpiLabel}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900 leading-none">
            {kpiValue.toLocaleString()}
          </span>
          {percentageChange !== undefined && (
            <TrendBadge value={percentageChange} size="sm" />
          )}
        </div>
      </div>
    </GlassCard>
  );
};

export { AgentMiniCard };
