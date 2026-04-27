import { useTranslation } from 'react-i18next';
import { Loader2, Coins, Scissors, Package, Wrench, Receipt, Tag } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { SampleCostBreakdown } from '@/services/productionApi';

interface Props {
  breakdown: SampleCostBreakdown | null;
  loading?: boolean;
  markupPercent: number | null;
  className?: string;
}

/**
 * Right-rail panel that explains the sample's per-piece cost and
 * suggested selling price. Lists each fabric and accessory contribution
 * line by line so the admin sees exactly where the number comes from —
 * "estimated cost: 95.50 MAD" by itself isn't actionable, but the same
 * number with a breakdown is.
 */
export function SampleCostPanel({ breakdown, loading, markupPercent, className }: Props) {
  const { t } = useTranslation();

  if (loading || !breakdown) {
    return (
      <aside
        className={cn(
          'flex h-full flex-col items-center justify-center gap-2 rounded-card border border-gray-100 bg-white p-6',
          className,
        )}
      >
        <Loader2 size={18} className="animate-spin text-gray-300" />
        <p className="text-xs text-gray-400">{t('production.samples.cost.computing')}</p>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        'flex flex-col gap-4 rounded-card border border-gray-100 bg-white p-5',
        className,
      )}
    >
      <header>
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Coins size={14} className="text-primary" />
          {t('production.samples.cost.title')}
        </h3>
        <p className="mt-0.5 text-[10px] text-gray-400">
          {t('production.samples.cost.subtitle')}
        </p>
      </header>

      <div className="flex items-baseline justify-between gap-2 rounded-card bg-gray-50 px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">
            {t('production.samples.cost.totalPerPiece')}
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {breakdown.total.toFixed(2)}{' '}
            <span className="text-sm font-semibold text-gray-500">MAD</span>
          </p>
        </div>
        {breakdown.suggestedPrice != null && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-emerald-600">
              {t('production.samples.cost.suggested')}
            </p>
            <p className="text-xl font-bold text-emerald-700">
              {breakdown.suggestedPrice.toFixed(2)}
              <span className="ml-1 text-[10px] font-semibold text-emerald-600">MAD</span>
            </p>
            {markupPercent != null && (
              <p className="text-[10px] text-emerald-600">+{markupPercent.toFixed(0)}%</p>
            )}
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        <CostLine
          icon={<Scissors size={12} />}
          label={t('production.samples.cost.fabric')}
          value={breakdown.fabric}
        />
        <CostLine
          icon={<Package size={12} />}
          label={t('production.samples.cost.accessories')}
          value={breakdown.accessories}
        />
        <CostLine
          icon={<Wrench size={12} />}
          label={t('production.samples.cost.labor')}
          value={breakdown.labor}
        />
        <CostLine
          icon={<Receipt size={12} />}
          label={t('production.samples.cost.fees')}
          value={breakdown.fees}
        />
      </ul>

      {breakdown.fabricDetail.length > 0 && (
        <Section title={t('production.samples.cost.fabricBreakdown')}>
          {breakdown.fabricDetail.map((d) => (
            <DetailRow
              key={d.fabricTypeId}
              label={d.fabricTypeName}
              hint={t('production.samples.cost.fabricHint', {
                meters: d.avgMetersPerPiece.toFixed(2),
                mad: d.avgMadPerMeter.toFixed(2),
              })}
              value={d.contribution}
            />
          ))}
        </Section>
      )}

      {breakdown.accessoryDetail.length > 0 && (
        <Section title={t('production.samples.cost.accessoryBreakdown')}>
          {breakdown.accessoryDetail.map((d) => (
            <DetailRow
              key={d.materialId}
              label={d.materialName}
              hint={t('production.samples.cost.accessoryHint', {
                qty: d.quantityPerPiece,
                mad: d.unitCost.toFixed(2),
              })}
              value={d.contribution}
            />
          ))}
        </Section>
      )}
    </aside>
  );
}

function CostLine({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-2 text-gray-600">
        <span className="text-gray-400">{icon}</span>
        {label}
      </span>
      <span className="font-semibold text-gray-900">{value.toFixed(2)} MAD</span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <Tag size={9} />
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

function DetailRow({
  label,
  hint,
  value,
}: {
  label: string;
  hint?: string;
  value: number;
}) {
  return (
    <li className="flex items-start justify-between gap-2 text-[11px]">
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-700">{label}</p>
        {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
      </div>
      <span className="shrink-0 font-semibold text-gray-900">{value.toFixed(2)}</span>
    </li>
  );
}
