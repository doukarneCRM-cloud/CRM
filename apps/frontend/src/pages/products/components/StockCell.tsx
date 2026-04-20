import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { productsApi } from '@/services/productsApi';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  productId: string;
  variantId: string;
  stock: number;
  canEdit: boolean;
}

function tone(stock: number) {
  if (stock === 0) return 'bg-red-50 text-red-700 border-red-200';
  if (stock <= 2) return 'bg-red-50 text-red-700 border-red-200';
  if (stock <= 5) return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-emerald-50 text-emerald-800 border-emerald-200';
}

export function StockCell({ productId, variantId, stock, canEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(stock));
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<'success' | 'error' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setValue(String(stock));
  }, [stock, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  const commit = async () => {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) {
      setValue(String(stock));
      setEditing(false);
      return;
    }
    if (next === stock) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await productsApi.updateStock(productId, variantId, next);
      setFlash('success');
      setEditing(false);
    } catch (err) {
      setFlash('error');
      setValue(String(stock));
      setEditing(false);
      console.error('Stock update failed:', apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setValue(String(stock));
    setEditing(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void commit();
    if (e.key === 'Escape') cancel();
  };

  const baseCls = cn(
    'flex h-11 w-full items-center justify-center rounded-input border font-semibold text-sm transition-all',
    tone(stock),
    flash === 'success' && 'ring-2 ring-emerald-400/60',
    flash === 'error' && 'ring-2 ring-red-400/60',
    canEdit && 'cursor-text hover:brightness-95',
  );

  if (editing && canEdit) {
    return (
      <div className={baseCls}>
        <input
          ref={inputRef}
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => void commit()}
          className="h-full w-full bg-transparent text-center text-sm font-semibold focus:outline-none"
          disabled={saving}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!canEdit || saving}
      onClick={() => canEdit && setEditing(true)}
      className={baseCls}
      aria-label={`Stock: ${stock}`}
    >
      {saving ? <Loader2 size={14} className="animate-spin" /> : stock}
    </button>
  );
}
