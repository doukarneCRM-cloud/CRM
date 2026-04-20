import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  label?: string;
  placeholder?: string;
  values: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

// Chip-style multi-value input. Enter or comma commits a tag; Backspace on
// empty input removes the last tag. Duplicates (case-insensitive) are ignored.
export function TagInput({ label, placeholder, values, onChange, className }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const lower = new Set(values.map((v) => v.toLowerCase()));
    const merged = [...values];
    for (const p of parts) {
      if (!lower.has(p.toLowerCase())) {
        merged.push(p);
        lower.add(p.toLowerCase());
      }
    }
    onChange(merged);
    setDraft('');
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const remove = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-input border border-gray-200 bg-white px-2 py-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-badge bg-accent px-2 py-0.5 text-xs font-medium text-primary"
          >
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label={`Remove ${v}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
        />
      </div>
    </div>
  );
}
