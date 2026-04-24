import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

interface CRMSelectProps {
  options: SelectOption[];
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  multi?: boolean;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}

const CRMSelect = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  error,
  multi = false,
  searchable = false,
  disabled = false,
  className,
}: CRMSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Menu position (fixed-coord in viewport) is recomputed on open + on
  // scroll/resize. We portal the menu to <body> so parents with
  // overflow:hidden / overflow:auto can't clip it, which used to cause the
  // options list to get covered by the table below on LogsTab.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedValues = multi
    ? (Array.isArray(value) ? value : [])
    : value
    ? [value as string]
    : [];

  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    // `capture: true` so scrolls on ancestor scroll containers reach us too —
    // otherwise the menu floats in place while the trigger scrolls away.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target) ?? false;
      const inMenu = menuRef.current?.contains(target) ?? false;
      if (!inTrigger && !inMenu) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (val: string) => {
    if (multi) {
      const arr = selectedValues.includes(val)
        ? selectedValues.filter((v) => v !== val)
        : [...selectedValues, val];
      onChange(arr);
    } else {
      onChange(val);
      setOpen(false);
    }
  };

  const displayLabel = () => {
    if (selectedValues.length === 0) return placeholder;
    if (multi) {
      if (selectedValues.length === 1) {
        return options.find((o) => o.value === selectedValues[0])?.label ?? placeholder;
      }
      return `${selectedValues.length} selected`;
    }
    return options.find((o) => o.value === selectedValues[0])?.label ?? placeholder;
  };

  return (
    <div ref={containerRef} className={cn('relative flex flex-col gap-1.5', className)}>
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}

      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between rounded-input border bg-white px-4 py-2.5 text-sm transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
          'disabled:cursor-not-allowed disabled:bg-gray-50',
          selectedValues.length > 0 ? 'text-gray-900' : 'text-gray-400',
          error ? 'border-red-400' : 'border-gray-200',
          open && 'border-primary ring-2 ring-primary/30',
        )}
      >
        <span className="truncate">{displayLabel()}</span>
        <div className="flex items-center gap-1">
          {multi && selectedValues.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={16}
            className={cn('text-gray-400 transition-transform', open && 'rotate-180')}
          />
        </div>
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[60] rounded-input border border-gray-200 bg-white shadow-hover"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          >
            {searchable && (
              <div className="border-b border-gray-100 p-2">
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
                  <Search size={14} className="text-gray-400" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder-gray-400"
                  />
                </div>
              </div>
            )}
            <ul className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <li className="px-4 py-3 text-sm text-gray-400">No options found</li>
              )}
              {filtered.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                  <li
                    key={option.value}
                    onClick={() => toggle(option.value)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors',
                      isSelected
                        ? 'bg-accent text-primary font-medium'
                        : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    {option.label}
                    {isSelected && <Check size={14} />}
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}

      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  );
};

export { CRMSelect };
