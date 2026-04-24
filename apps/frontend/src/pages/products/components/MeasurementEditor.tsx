import { useTranslation } from 'react-i18next';
import { Plus, Ruler, Trash2, X } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { cn } from '@/lib/cn';
import type { ProductMeasurements } from '@/services/productsApi';

interface Props {
  value: ProductMeasurements | null;
  onChange: (next: ProductMeasurements | null) => void;
}

const PRESET: ProductMeasurements = {
  columns: ['Size', 'Chest', 'Waist', 'Length'],
  rows: [
    ['S', '', '', ''],
    ['M', '', '', ''],
    ['L', '', '', ''],
    ['XL', '', '', ''],
  ],
};

function emptyRow(cols: number): string[] {
  return Array.from({ length: cols }, () => '');
}

export function MeasurementEditor({ value, onChange }: Props) {
  const { t } = useTranslation();
  const data = value;

  const handleStart = (preset: boolean) => {
    onChange(preset ? PRESET : { columns: ['Size'], rows: [['']] });
  };

  const handleClear = () => onChange(null);

  if (!data || data.columns.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-dashed border-gray-200 bg-white/60 p-4">
        <div className="flex items-center gap-2">
          <Ruler size={14} className="text-primary" />
          <h4 className="text-sm font-semibold text-gray-900">{t('products.measurements.title')}</h4>
          <span className="text-[11px] text-gray-400">{t('products.measurements.optional')}</span>
        </div>
        <p className="text-[11px] text-gray-500">{t('products.measurements.description')}</p>
        <div className="flex flex-wrap gap-2">
          <CRMButton
            type="button"
            size="sm"
            variant="secondary"
            leftIcon={<Plus size={12} />}
            onClick={() => handleStart(true)}
          >
            {t('products.measurements.usePreset')}
          </CRMButton>
          <CRMButton
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={<Plus size={12} />}
            onClick={() => handleStart(false)}
          >
            {t('products.measurements.startBlank')}
          </CRMButton>
        </div>
      </div>
    );
  }

  const setColumn = (idx: number, label: string) => {
    const columns = [...data.columns];
    columns[idx] = label;
    onChange({ ...data, columns });
  };

  const addColumn = () => {
    if (data.columns.length >= 12) return;
    onChange({
      columns: [...data.columns, ''],
      rows: data.rows.map((r) => [...r, '']),
    });
  };

  const removeColumn = (idx: number) => {
    if (data.columns.length <= 1) {
      onChange(null);
      return;
    }
    onChange({
      columns: data.columns.filter((_, i) => i !== idx),
      rows: data.rows.map((r) => r.filter((_, i) => i !== idx)),
    });
  };

  const addRow = () => {
    if (data.rows.length >= 50) return;
    onChange({ ...data, rows: [...data.rows, emptyRow(data.columns.length)] });
  };

  const removeRow = (idx: number) => {
    onChange({ ...data, rows: data.rows.filter((_, i) => i !== idx) });
  };

  const setCell = (rIdx: number, cIdx: number, value: string) => {
    const rows = data.rows.map((row, ri) =>
      ri === rIdx ? row.map((cell, ci) => (ci === cIdx ? value : cell)) : row,
    );
    onChange({ ...data, rows });
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-gray-100 bg-accent/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Ruler size={14} className="text-primary" />
          <h4 className="text-sm font-semibold text-gray-900">{t('products.measurements.title')}</h4>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="text-[11px] font-medium text-gray-400 hover:text-red-500"
        >
          {t('products.measurements.removeChart')}
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-gray-100 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50">
                {data.columns.map((c, idx) => (
                  <th key={idx} className="border-b border-gray-100 px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        value={c}
                        onChange={(e) => setColumn(idx, e.target.value)}
                        placeholder={idx === 0 ? t('products.measurements.columnSize') : t('products.measurements.columnPlaceholder')}
                        className="w-full min-w-[64px] rounded-input border border-gray-200 px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => removeColumn(idx)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label={t('products.measurements.removeColumn')}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="w-10 border-b border-gray-100 bg-gray-50" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-accent/15'}>
                  {data.columns.map((_, cIdx) => (
                    <td key={cIdx} className="px-2 py-1">
                      <input
                        value={row[cIdx] ?? ''}
                        onChange={(e) => setCell(rIdx, cIdx, e.target.value)}
                        placeholder={cIdx === 0 ? 'M' : '—'}
                        className={cn(
                          'w-full min-w-[64px] rounded-input border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30',
                          cIdx === 0 && 'font-semibold',
                        )}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(rIdx)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label={t('products.measurements.removeRow')}
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CRMButton
          type="button"
          size="sm"
          variant="ghost"
          leftIcon={<Plus size={12} />}
          onClick={addRow}
          disabled={data.rows.length >= 50}
        >
          {t('products.measurements.addRow')}
        </CRMButton>
        <CRMButton
          type="button"
          size="sm"
          variant="ghost"
          leftIcon={<Plus size={12} />}
          onClick={addColumn}
          disabled={data.columns.length >= 12}
        >
          {t('products.measurements.addColumn')}
        </CRMButton>
      </div>
    </div>
  );
}
