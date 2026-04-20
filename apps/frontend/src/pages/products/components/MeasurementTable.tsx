import { Ruler } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ProductMeasurements } from '@/services/productsApi';

interface Props {
  data: ProductMeasurements | null | undefined;
  className?: string;
  compact?: boolean;
}

function isEmpty(data: ProductMeasurements | null | undefined): boolean {
  if (!data) return true;
  if (data.columns.length === 0) return true;
  if (data.rows.length === 0) return true;
  return false;
}

export function MeasurementTable({ data, className, compact = false }: Props) {
  if (isEmpty(data)) return null;
  const { columns, rows } = data!;

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-gray-100 bg-white/70',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-gray-100 bg-accent/30 px-3 py-1.5">
        <Ruler size={12} className="text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
          Measurements (cm)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
              {columns.map((c, i) => (
                <th
                  key={`${c}-${i}`}
                  className={cn(
                    'whitespace-nowrap border-b border-gray-100 px-2.5 text-left font-semibold uppercase tracking-wide text-gray-500',
                    compact ? 'py-1 text-[10px]' : 'py-1.5 text-[11px]',
                  )}
                >
                  {c || '—'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={rIdx % 2 === 0 ? 'bg-white' : 'bg-accent/15'}
              >
                {columns.map((_, cIdx) => (
                  <td
                    key={cIdx}
                    className={cn(
                      'whitespace-nowrap border-b border-gray-50 px-2.5 text-gray-700',
                      compact ? 'py-1 text-[11px]' : 'py-1.5',
                      cIdx === 0 && 'font-semibold text-gray-900',
                    )}
                  >
                    {row[cIdx] || <span className="text-gray-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
