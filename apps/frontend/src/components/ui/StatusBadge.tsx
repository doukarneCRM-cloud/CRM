import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
  const config = getStatusConfig(status as OrderStatus);
  // Look up translated label by canonical status key. Fall back to the
  // English label from statusColors for any non-canonical/unknown key.
  const i18nKey = `shared.statusBadge.${status}`;
  const hasTranslation = i18n.exists(i18nKey);
  const label = hasTranslation ? t(i18nKey) : config.label;

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
      {label}
    </span>
  );
};

export { StatusBadge };
