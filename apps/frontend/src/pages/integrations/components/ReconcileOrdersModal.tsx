import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, ArrowDownToLine } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import type { ReconcileResult } from '@/services/integrationsApi';
import { cn } from '@/lib/cn';

interface Props {
  result: ReconcileResult | null;
  open: boolean;
  onClose: () => void;
}

// Renders the per-order outcome list returned by the reconciliation
// endpoint. Splits the rows into three buckets so the operator sees
// imported / failed first (the actionable ones) and "in CRM" rows last,
// with their YouCan ref + customer + error reason inline.
export function ReconcileOrdersModal({ result, open, onClose }: Props) {
  const { t } = useTranslation();
  if (!result) return null;

  const failed = result.rows.filter((r) => r.outcome === 'failed');
  const imported = result.rows.filter((r) => r.outcome === 'imported');
  const inCrm = result.rows.filter((r) => r.outcome === 'in_crm');

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      size="3xl"
      title={t('integrations.reconcile.title', { name: result.storeName })}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2 text-center text-[11px]">
          <div>
            <p className="font-semibold text-gray-900">{result.scanned}</p>
            <p className="text-gray-400">{t('integrations.reconcile.scanned')}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">{result.inCrm}</p>
            <p className="text-gray-400">{t('integrations.reconcile.inCrm')}</p>
          </div>
          <div>
            <p className="font-semibold text-emerald-700">{result.imported}</p>
            <p className="text-gray-400">{t('integrations.reconcile.imported')}</p>
          </div>
          <div>
            <p
              className={cn(
                'font-semibold',
                result.failed > 0 ? 'text-red-600' : 'text-gray-700',
              )}
            >
              {result.failed}
            </p>
            <p className="text-gray-400">{t('integrations.reconcile.failed')}</p>
          </div>
        </div>

        <p className="text-[11px] text-gray-400">
          {t('integrations.reconcile.windowHint', {
            from: new Date(result.windowFrom).toLocaleString(),
            to: new Date(result.windowTo).toLocaleString(),
          })}
        </p>

        {result.scanned === 0 && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            {t('integrations.reconcile.emptyWindow')}
          </div>
        )}

        {failed.length > 0 && (
          <RowSection
            label={t('integrations.reconcile.failedHeader')}
            tone="red"
            rows={failed}
          />
        )}

        {imported.length > 0 && (
          <RowSection
            label={t('integrations.reconcile.importedHeader')}
            tone="emerald"
            rows={imported}
          />
        )}

        {inCrm.length > 0 && (
          <details className="rounded-xl border border-gray-100">
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
              {t('integrations.reconcile.inCrmHeader', { count: inCrm.length })}
            </summary>
            <RowSection label="" tone="gray" rows={inCrm} flat />
          </details>
        )}
      </div>
    </GlassModal>
  );
}

function RowSection({
  label,
  rows,
  tone,
  flat,
}: {
  label: string;
  rows: ReconcileResult['rows'];
  tone: 'emerald' | 'red' | 'gray';
  flat?: boolean;
}) {
  const Icon = tone === 'red' ? AlertCircle : tone === 'emerald' ? CheckCircle2 : ArrowDownToLine;
  const tones: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    gray: 'text-gray-600',
  };
  return (
    <div className={cn(!flat && 'rounded-xl border border-gray-100 overflow-hidden')}>
      {label && (
        <div className={cn('flex items-center gap-2 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold', tones[tone])}>
          <Icon size={12} />
          {label}
        </div>
      )}
      <div className="divide-y divide-gray-100 bg-white">
        {rows.map((r) => (
          <div key={r.youcanOrderId} className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[11px]">
            <div className="col-span-3 font-mono text-gray-700">{r.youcanRef ?? r.youcanOrderId}</div>
            <div className="col-span-3 truncate text-gray-700" title={r.customer?.name ?? ''}>
              {r.customer?.name ?? '—'}
            </div>
            <div className="col-span-2 truncate font-mono text-gray-500" title={r.customer?.phone ?? ''}>
              {r.customer?.phone ?? '—'}
            </div>
            <div className="col-span-2 text-[10px] text-gray-400">
              {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
            </div>
            <div className="col-span-2 truncate" title={r.error ?? ''}>
              {r.outcome === 'failed' && r.error ? (
                <span className="text-red-600">{r.error}</span>
              ) : r.outcome === 'imported' ? (
                <span className="text-emerald-700">✓</span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
