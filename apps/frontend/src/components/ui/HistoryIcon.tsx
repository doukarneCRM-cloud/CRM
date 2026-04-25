import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { cn } from '@/lib/cn';

interface HistoryIconProps {
  onClick?: () => void;
  className?: string;
}

const HistoryIcon = ({ onClick, className }: HistoryIconProps) => {
  const { t } = useTranslation();
  return (
    <div className={cn('group relative inline-flex', className)}>
      <button
        type="button"
        onClick={onClick}
        className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-accent hover:text-primary"
      >
        <History size={14} />
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {t('shared.history.view')}
      </div>
    </div>
  );
};

export { HistoryIcon };
