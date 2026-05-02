import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, SlidersHorizontal, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFilterStore } from '@/store/filterStore';
import { CRMButton } from './CRMButton';
import { FbDateRangePicker } from './FbDateRangePicker';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterChipConfig {
  key:
    | 'cities'
    | 'agentIds'
    | 'productIds'
    | 'confirmationStatuses'
    | 'shippingStatuses'
    | 'sources';
  label: string;
  options: FilterOption[];
}

interface GlobalFilterBarProps {
  filterConfigs?: FilterChipConfig[];
  showDateRange?: boolean;
  sticky?: boolean;
  className?: string;
}

// ─── Dropdown chip (portal-rendered) ─────────────────────────────────────────

function FilterChip({
  config,
  selected,
  onToggle,
  onClear,
}: {
  config: FilterChipConfig;
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const count = selected.length;

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const DROPDOWN_W = Math.max(220, rect.width);
    const DROPDOWN_H = 320;
    let left = rect.left;
    if (left + DROPDOWN_W > window.innerWidth - 12) left = window.innerWidth - DROPDOWN_W - 12;
    let top = rect.bottom + 4;
    if (top + DROPDOWN_H > window.innerHeight - 12) top = rect.top - DROPDOWN_H - 4;
    setPos({ top, left, width: DROPDOWN_W });
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-badge px-3 py-1.5 text-sm font-medium transition-all',
          count > 0
            ? 'bg-gradient-to-br from-tone-lavender-500 to-[#5E3FE6] text-white shadow-[0_3px_10px_rgba(124,92,255,0.30)]'
            : 'border border-gray-200 bg-white text-gray-600 hover:border-tone-lavender-300 hover:text-tone-lavender-500',
        )}
      >
        {config.label}
        {count > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-[10px] font-bold">
            {count}
          </span>
        )}
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[61] overflow-hidden rounded-input border border-gray-200 bg-white shadow-hover"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <ul className="max-h-[260px] overflow-y-auto py-1">
              {config.options.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <li
                    key={opt.value}
                    onClick={() => onToggle(opt.value)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors',
                      isSelected
                        ? 'bg-tone-lavender-50 font-medium text-tone-lavender-500'
                        : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={13} className="text-tone-lavender-500" />}
                  </li>
                );
              })}
            </ul>
            {count > 0 && (
              <div className="border-t border-gray-100 px-3 py-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear();
                    setOpen(false);
                  }}
                  className="text-xs font-medium text-red-500 hover:text-red-600"
                >
                  {t('shared.filterBar.clearFilter')}
                </button>
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

// ─── GlobalFilterBar ─────────────────────────────────────────────────────────

const GlobalFilterBar = ({
  filterConfigs = [],
  showDateRange = true,
  sticky = true,
  className,
}: GlobalFilterBarProps) => {
  const { t } = useTranslation();
  const { clearAll, hasActiveFilters, activeFilterCount, toggleArrayFilter, clearFilter } =
    useFilterStore();
  const storeState = useFilterStore();

  const active = hasActiveFilters();
  const count = activeFilterCount();

  return (
    <div
      className={cn(
        'flex items-center gap-3 overflow-x-auto scrollbar-hide',
        'rounded-card border border-gray-100 bg-white/80 backdrop-blur-sm px-4 py-3',
        sticky && 'sticky top-0 z-20',
        className,
      )}
    >
      {/* Icon */}
      <div className="flex shrink-0 items-center gap-2 text-gray-500">
        <SlidersHorizontal size={15} />
        <span className="text-sm font-medium">{t('shared.filterBar.filters')}</span>
        {count > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tone-lavender-500 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </div>

      <div className="h-4 w-px shrink-0 bg-gray-200" />

      {/* Filter chips */}
      {filterConfigs.map((config) => (
        <FilterChip
          key={config.key}
          config={config}
          selected={storeState[config.key] as string[]}
          onToggle={(value) => toggleArrayFilter(config.key, value)}
          onClear={() => clearFilter(config.key)}
        />
      ))}

      {/* Date range (Facebook-style) */}
      {showDateRange && <FbDateRangePicker className="shrink-0" />}

      {/* Clear all */}
      {active && (
        <>
          <div className="h-4 w-px shrink-0 bg-gray-200" />
          <CRMButton variant="ghost" size="sm" onClick={clearAll} leftIcon={<X size={12} />}>
            {t('shared.filterBar.clearAll')}
          </CRMButton>
        </>
      )}
    </div>
  );
};

export { GlobalFilterBar };
export type { FilterChipConfig, FilterOption };
