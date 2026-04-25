import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFilterStore } from '@/store/filterStore';
import { CRMButton } from './CRMButton';

// ─── Date helpers (local, no tz drift) ────────────────────────────────────────

function toISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fromISO(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonths(d: Date, n: number) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function between(d: Date, from: Date, to: Date) { return d.getTime() >= from.getTime() && d.getTime() <= to.getTime(); }

const FALLBACK_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FALLBACK_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ─── Presets ──────────────────────────────────────────────────────────────────

type PresetKey = 'today' | 'yesterday' | 'last7' | 'last15' | 'lastMonth' | 'thisMonth' | 'custom';

function computePreset(key: PresetKey): { from: Date; to: Date } | null {
  const today = startOfDay(new Date());
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = addDays(today, -1); return { from: y, to: y }; }
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last15': return { from: addDays(today, -14), to: today };
    case 'thisMonth': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: first, to: today };
    }
    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: first, to: last };
    }
    default: return null;
  }
}

function detectPreset(from: Date | null, to: Date | null): PresetKey {
  if (!from || !to) return 'custom';
  const keys: PresetKey[] = ['today', 'yesterday', 'last7', 'last15', 'thisMonth', 'lastMonth'];
  for (const k of keys) {
    const r = computePreset(k);
    if (r && sameDay(r.from, from) && sameDay(r.to, to)) return k;
  }
  return 'custom';
}

const PRESET_KEYS: PresetKey[] = ['today', 'yesterday', 'last7', 'last15', 'thisMonth', 'lastMonth', 'custom'];

// ─── Calendar grid ────────────────────────────────────────────────────────────

function MonthGrid({
  month,
  from,
  to,
  hover,
  onHover,
  onPick,
  weekdays,
}: {
  month: Date;
  from: Date | null;
  to: Date | null;
  hover: Date | null;
  onHover: (d: Date | null) => void;
  onPick: (d: Date) => void;
  weekdays: string[];
}) {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const daysInPrev = new Date(month.getFullYear(), month.getMonth(), 0).getDate();

  // 42 cells (6 weeks × 7)
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(month.getFullYear(), month.getMonth() - 1, daysInPrev - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(month.getFullYear(), month.getMonth(), d), inMonth: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1]!.date;
    cells.push({ date: addDays(last, 1), inMonth: false });
  }

  // hover preview: when user has picked `from` but no `to`, show range up to hovered date
  const previewEnd = from && !to && hover ? hover : to;
  const rangeStart = from;
  const rangeEnd = previewEnd;

  return (
    <div className="flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-y-1 pb-1.5">
        {weekdays.map((l, i) => (
          <span key={i} className="text-center text-[10px] font-semibold uppercase text-gray-400">
            {l}
          </span>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((cell, i) => {
          const isStart = rangeStart && sameDay(cell.date, rangeStart);
          const isEnd = rangeEnd && sameDay(cell.date, rangeEnd);
          const inRange = rangeStart && rangeEnd && between(cell.date, rangeStart, rangeEnd);
          const isEndpoint = isStart || isEnd;

          return (
            <div
              key={i}
              onMouseEnter={() => onHover(cell.date)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                'relative flex justify-center',
                inRange && !isEndpoint && 'bg-primary/10',
                isStart && rangeEnd && !sameDay(rangeStart!, rangeEnd) && 'rounded-l-full bg-primary/10',
                isEnd && rangeStart && !sameDay(rangeStart, rangeEnd!) && 'rounded-r-full bg-primary/10',
              )}
            >
              <button
                type="button"
                onClick={() => onPick(cell.date)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  !cell.inMonth && 'text-gray-300',
                  cell.inMonth && !isEndpoint && !inRange && 'text-gray-700 hover:bg-gray-100',
                  cell.inMonth && inRange && !isEndpoint && 'text-primary',
                  isEndpoint && 'bg-primary text-white shadow-sm',
                )}
              >
                {cell.date.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DateRangeValue {
  from: string | null;
  to: string | null;
}

interface FbDateRangePickerProps {
  className?: string;
  /** Controlled value. When provided with `onChange`, the picker bypasses the
   *  global filter store and operates as a pure controlled component — used by
   *  the dashboard's "Compare to" slot. */
  value?: DateRangeValue;
  onChange?: (range: DateRangeValue) => void;
  /** Optional label for the trigger button when no range is selected. */
  placeholder?: string;
  /** Optional icon override. */
  icon?: React.ComponentType<{ size?: number | string }>;
}

export function FbDateRangePicker({
  className,
  value,
  onChange,
  placeholder,
  icon: IconOverride,
}: FbDateRangePickerProps) {
  const { t } = useTranslation();
  const monthsTranslated = t('shared.datePicker.months', { returnObjects: true }) as unknown;
  const weekdaysTranslated = t('shared.datePicker.weekdays', { returnObjects: true }) as unknown;
  const MONTH_NAMES = Array.isArray(monthsTranslated) ? (monthsTranslated as string[]) : FALLBACK_MONTHS;
  const DAY_LABELS = Array.isArray(weekdaysTranslated) ? (weekdaysTranslated as string[]) : FALLBACK_WEEKDAYS;
  const effectivePlaceholder = placeholder ?? t('shared.datePicker.rangePlaceholder');
  const PRESETS: { key: PresetKey; label: string }[] = PRESET_KEYS.map((k) => ({
    key: k,
    label: t(`shared.datePicker.${k}`),
  }));
  const store = useFilterStore();
  const controlled = value !== undefined && onChange !== undefined;
  const dateRange: DateRangeValue = controlled ? value! : store.dateRange;
  const commitRange = (next: DateRangeValue) => {
    if (controlled) onChange!(next);
    else store.setFilter('dateRange', next);
  };
  const [open, setOpen] = useState(false);

  // Draft state — only committed on Apply
  const [draftFrom, setDraftFrom] = useState<Date | null>(fromISO(dateRange.from));
  const [draftTo, setDraftTo] = useState<Date | null>(fromISO(dateRange.to));
  const [hover, setHover] = useState<Date | null>(null);
  const [leftMonth, setLeftMonth] = useState<Date>(() => {
    const f = fromISO(dateRange.from);
    return f ? new Date(f.getFullYear(), f.getMonth(), 1) : new Date();
  });
  const [pickingEnd, setPickingEnd] = useState(false); // true = next click sets `to`

  // Positioning
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Sync draft when store changes externally (Clear all)
  useEffect(() => {
    if (!open) {
      setDraftFrom(fromISO(dateRange.from));
      setDraftTo(fromISO(dateRange.to));
      setPickingEnd(false);
    }
  }, [dateRange.from, dateRange.to, open]);

  // Compute popover position
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const POPOVER_W = 680;
    const POPOVER_H = 420;
    let left = rect.left;
    if (left + POPOVER_W > window.innerWidth - 12) left = window.innerWidth - POPOVER_W - 12;
    if (left < 12) left = 12;
    let top = rect.bottom + 6;
    if (top + POPOVER_H > window.innerHeight - 12) top = rect.top - POPOVER_H - 6;
    if (top < 12) top = 12;
    setPos({ top, left });
  }, [open]);

  const activePreset = useMemo(() => detectPreset(draftFrom, draftTo), [draftFrom, draftTo]);

  const handlePreset = (key: PresetKey) => {
    if (key === 'custom') {
      setPickingEnd(false);
      return;
    }
    const r = computePreset(key);
    if (!r) return;
    setDraftFrom(r.from);
    setDraftTo(r.to);
    setLeftMonth(new Date(r.from.getFullYear(), r.from.getMonth(), 1));
    setPickingEnd(false);
  };

  const handlePick = (d: Date) => {
    if (!draftFrom || pickingEnd === false) {
      setDraftFrom(d);
      setDraftTo(null);
      setPickingEnd(true);
      return;
    }
    // Picking end — ensure order
    if (d.getTime() < draftFrom.getTime()) {
      setDraftTo(draftFrom);
      setDraftFrom(d);
    } else {
      setDraftTo(d);
    }
    setPickingEnd(false);
  };

  const handleApply = () => {
    commitRange({
      from: draftFrom ? toISO(draftFrom) : null,
      to: draftTo ? toISO(draftTo) : null,
    });
    setOpen(false);
  };

  const handleClear = () => {
    setDraftFrom(null);
    setDraftTo(null);
    commitRange({ from: null, to: null });
    setOpen(false);
  };

  // Trigger button label
  const hasRange = dateRange.from || dateRange.to;
  const fmt = (iso: string | null) => {
    if (!iso) return '';
    const d = fromISO(iso)!;
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  };
  const label = hasRange
    ? `${fmt(dateRange.from)}${dateRange.to && dateRange.to !== dateRange.from ? ` – ${fmt(dateRange.to)}` : ''}`
    : effectivePlaceholder;

  const rightMonth = addMonths(leftMonth, 1);
  const TriggerIcon = IconOverride ?? Calendar;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-badge border px-3 py-1.5 text-sm transition-colors',
          hasRange
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-gray-200 bg-white text-gray-600 hover:border-primary hover:text-primary',
          className,
        )}
      >
        <TriggerIcon size={13} />
        <span className="font-medium">{label}</span>
        {hasRange && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            className="ml-1 flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={10} />
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[61] w-[680px] overflow-hidden rounded-card border border-gray-100 bg-white shadow-hover"
            style={{ top: pos.top, left: pos.left }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="text-sm font-bold text-gray-800">
                {draftFrom ? fmt(toISO(draftFrom)) : t('shared.datePicker.startDate')}
                {draftTo && !sameDay(draftFrom!, draftTo) && ` – ${fmt(toISO(draftTo))}`}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex">
              {/* Presets */}
              <div className="flex w-40 shrink-0 flex-col border-r border-gray-100 py-3">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => handlePreset(p.key)}
                    className={cn(
                      'flex items-center justify-between px-5 py-2 text-left text-xs font-medium transition-colors',
                      activePreset === p.key
                        ? 'bg-accent text-primary'
                        : 'text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Calendar area */}
              <div className="flex-1 p-4">
                {/* Month nav */}
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setLeftMonth(addMonths(leftMonth, -1))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <div className="flex flex-1 justify-around text-xs font-semibold text-gray-700">
                    <span>{MONTH_NAMES[leftMonth.getMonth()]} {leftMonth.getFullYear()}</span>
                    <span>{MONTH_NAMES[rightMonth.getMonth()]} {rightMonth.getFullYear()}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLeftMonth(addMonths(leftMonth, 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Two months */}
                <div className="grid grid-cols-2 gap-6">
                  <MonthGrid month={leftMonth} from={draftFrom} to={draftTo} hover={hover} onHover={setHover} onPick={handlePick} weekdays={DAY_LABELS} />
                  <MonthGrid month={rightMonth} from={draftFrom} to={draftTo} hover={hover} onHover={setHover} onPick={handlePick} weekdays={DAY_LABELS} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-gray-500 hover:text-red-500"
              >
                {t('shared.datePicker.clear')}
              </button>
              <div className="flex gap-2">
                <CRMButton variant="secondary" size="sm" onClick={() => setOpen(false)}>
                  {t('shared.datePicker.cancel')}
                </CRMButton>
                <CRMButton variant="primary" size="sm" onClick={handleApply} disabled={!draftFrom}>
                  {t('shared.datePicker.apply')}
                </CRMButton>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
