import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { facebookApi, type AdCampaign, type AdAdset } from '@/services/facebookApi';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-gray-100 text-gray-500',
  ARCHIVED: 'bg-gray-100 text-gray-400',
  DELETED: 'bg-red-50 text-red-600',
};

export function CampaignsTable({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [adsets, setAdsets] = useState<AdAdset[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'campaigns' | 'adsets'>('campaigns');

  useEffect(() => {
    setLoading(true);
    Promise.all([facebookApi.campaigns(accountId), facebookApi.adsets(accountId)])
      .then(([c, a]) => {
        setCampaigns(c);
        setAdsets(a);
      })
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) return null;
  return (
    <GlassCard className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-900">
          {t('integrations.facebook.campaigns.title')}
        </h3>
        <div className="flex gap-1 rounded-md bg-gray-100 p-0.5">
          <button
            onClick={() => setView('campaigns')}
            className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold ${
              view === 'campaigns' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {t('integrations.facebook.campaigns.tabCampaigns', { count: campaigns.length })}
          </button>
          <button
            onClick={() => setView('adsets')}
            className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold ${
              view === 'adsets' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {t('integrations.facebook.campaigns.tabAdsets', { count: adsets.length })}
          </button>
        </div>
      </div>

      {view === 'campaigns' ? (
        campaigns.length === 0 ? (
          <p className="text-center text-xs text-gray-400">
            {t('integrations.facebook.campaigns.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="py-1.5 pr-2">{t('integrations.facebook.campaigns.colName')}</th>
                  <th className="py-1.5 pr-2">{t('integrations.facebook.campaigns.colStatus')}</th>
                  <th className="py-1.5 text-right">{t('integrations.facebook.campaigns.col7d')}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2 text-gray-900">{c.name}</td>
                    <td className="py-1.5 pr-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                          STATUS_COLOR[c.status] ?? 'bg-gray-50 text-gray-500'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-700">
                      {Number(c.spendCached).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : adsets.length === 0 ? (
        <p className="text-center text-xs text-gray-400">
          {t('integrations.facebook.campaigns.emptyAdsets')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1.5 pr-2">{t('integrations.facebook.campaigns.colCampaign')}</th>
                <th className="py-1.5 pr-2">{t('integrations.facebook.campaigns.colAdset')}</th>
                <th className="py-1.5 pr-2">{t('integrations.facebook.campaigns.colStatus')}</th>
                <th className="py-1.5 text-right">{t('integrations.facebook.campaigns.col7d')}</th>
              </tr>
            </thead>
            <tbody>
              {adsets.map((a) => (
                <tr key={a.id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-2 text-gray-500">{a.campaignName ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-gray-900">{a.name}</td>
                  <td className="py-1.5 pr-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                        STATUS_COLOR[a.status] ?? 'bg-gray-50 text-gray-500'
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-gray-700">
                    {Number(a.spendCached).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
