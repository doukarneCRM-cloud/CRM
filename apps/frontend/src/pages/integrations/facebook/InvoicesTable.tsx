import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { facebookApi, type AdInvoice } from '@/services/facebookApi';

const STATUS_COLOR: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700',
  PENDING: 'bg-amber-50 text-amber-700',
  OVERDUE: 'bg-red-50 text-red-700',
  DUE: 'bg-amber-50 text-amber-700',
};

export function InvoicesTable({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    facebookApi
      .invoices(accountId)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) return null;

  return (
    <GlassCard className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-900">
          {t('integrations.facebook.invoices.title')}
        </h3>
        <span className="text-[10px] text-gray-400">
          {t('integrations.facebook.invoices.subtitle')}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-center text-xs text-gray-400">
          {t('integrations.facebook.invoices.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1.5 pr-2">{t('integrations.facebook.invoices.colPeriod')}</th>
                <th className="py-1.5 pr-2">{t('integrations.facebook.invoices.colStatus')}</th>
                <th className="py-1.5 pr-2 text-right">{t('integrations.facebook.invoices.colAmount')}</th>
                <th className="py-1.5">{t('integrations.facebook.invoices.colPdf')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const start = new Date(r.periodStart).toISOString().slice(0, 10);
                const end = new Date(r.periodEnd).toISOString().slice(0, 10);
                return (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2 text-gray-900">
                      {start} → {end}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                          STATUS_COLOR[r.status] ?? 'bg-gray-50 text-gray-500'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                      {Number(r.amount).toFixed(2)} {r.currency}
                    </td>
                    <td className="py-1.5">
                      {r.pdfUrl ? (
                        <a
                          href={r.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink size={10} />
                          {t('integrations.facebook.invoices.open')}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
