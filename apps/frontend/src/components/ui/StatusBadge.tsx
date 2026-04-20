import { cn } from '@/lib/cn';
import { getStatusConfig, type OrderStatus } from '@/constants/statusColors';

interface StatusBadgeProps {
  status: string;
  type?: 'confirmation' | 'shipping' | 'auto';
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
}

const sizeMap = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

const StatusBadge = ({ status, size = 'md', showDot = false }: StatusBadgeProps) => {
  const config = getStatusConfig(status as OrderStatus);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-badge font-semibold',
        config.bg,
        config.text,
        sizeMap[size],
      )}
    >
      {showDot && (
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', config.dot)} />
      )}
      {config.label}
    </span>
  );
};

export { StatusBadge };
