import { useTranslation } from 'react-i18next';
import { Pencil, FlaskConical, CheckCircle2, Archive } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { SampleStatus } from '@/services/productionApi';

interface Props {
  status: SampleStatus;
  size?: 'xs' | 'sm';
  className?: string;
}

const STYLE: Record<SampleStatus, { tone: string; Icon: typeof Pencil }> = {
  draft:    { tone: 'bg-gray-100 text-gray-600',     Icon: Pencil        },
  tested:   { tone: 'bg-amber-50 text-amber-700',    Icon: FlaskConical  },
  approved: { tone: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  archived: { tone: 'bg-gray-50 text-gray-400',      Icon: Archive       },
};

/**
 * Small status pill for samples. Three look variants — used on list rows,
 * detail headers, and dropdown items (sm) and inline grid cards (xs).
 */
export function SampleStatusPill({ status, size = 'sm', className }: Props) {
  const { t } = useTranslation();
  const { tone, Icon } = STYLE[status];
  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  const iconSize = size === 'xs' ? 9 : 11;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-badge font-semibold',
        padding,
        tone,
        className,
      )}
    >
      <Icon size={iconSize} />
      {t(`production.samples.status.${status}`)}
    </span>
  );
}
