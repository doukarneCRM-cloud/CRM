import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

interface TrendBadgeProps {
  value: number;
  unit?: string;
  size?: 'sm' | 'md';
}

const TrendBadge = ({ value, unit = '%', size = 'md' }: TrendBadgeProps) => {
  const isPositive = value > 0;
  const isNeutral = value === 0;

  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const formatted = `${isPositive ? '+' : ''}${value.toFixed(1)}${unit}`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-badge font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        isNeutral && 'bg-gray-100 text-gray-500',
        isPositive && 'bg-green-100 text-green-700',
        !isPositive && !isNeutral && 'bg-red-100 text-red-600',
      )}
    >
      <Icon size={size === 'sm' ? 10 : 12} strokeWidth={2.5} />
      {formatted}
    </span>
  );
};

export { TrendBadge };
