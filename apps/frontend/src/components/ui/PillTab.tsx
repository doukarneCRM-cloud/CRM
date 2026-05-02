import { cn } from '@/lib/cn';

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface PillTabGroupProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

const PillTabGroup = ({ tabs, activeTab, onChange, className }: PillTabGroupProps) => {
  return (
    <div className={cn('flex items-center gap-2 overflow-x-auto scrollbar-hide', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-badge px-4 py-2 text-sm font-semibold transition-all duration-200',
            activeTab === tab.id
              ? 'bg-gradient-to-br from-tone-lavender-500 to-[#5E3FE6] text-white shadow-[0_4px_12px_rgba(124,92,255,0.30)]'
              : 'text-gray-500 hover:bg-tone-lavender-50 hover:text-tone-lavender-500',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                activeTab === tab.id
                  ? 'bg-white/25 text-white'
                  : 'bg-gray-100 text-gray-500',
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

export { PillTabGroup };
export type { Tab };
