import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { facebookApi, type AdSpendDay } from '@/services/facebookApi';

export function SpendChart({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdSpendDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    facebookApi
      .spend(accountId, 30)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) return null;
  if (rows.length === 0) {
    return (
      <GlassCard className="p-3 text-center">
        <p className="text-xs text-gray-400">{t('integrations.facebook.spend.empty')}</p>
      </GlassCard>
    );
  }

  const max = Math.max(1, ...rows.map((r) => Number(r.spend)));
  const total = rows.reduce((s, r) => s + Number(r.spend), 0);
  const currency = rows[0]?.currency ?? 'USD';

  return (
    <GlassCard className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-900">
          {t('integrations.facebook.spend.title30d')}
        </h3>
        <span className="text-xs font-semibold text-gray-700">
          {total.toFixed(2)} {currency}
        </span>
      </div>
      <div className="flex items-end gap-1" style={{ height: 80 }}>
        {rows.map((r) => {
          const v = Number(r.spend);
          const heightPct = max > 0 ? (v / max) * 100 : 0;
          return (
            <div
              key={r.id}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${r.date.slice(0, 10)} — ${v.toFixed(2)} ${r.currency}`}
            >
              <div
                className="w-full rounded-t-sm bg-[#1877F2] transition-all"
                style={{ height: `${Math.max(heightPct, v > 0 ? 4 : 1)}%`, opacity: v > 0 ? 1 : 0.2 }}
              />
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
