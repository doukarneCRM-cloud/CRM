import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Eye, X } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { broadcastsApi, type BroadcastDetail } from '@/services/broadcastsApi';

interface Props {
  broadcastId: string | null;
  open: boolean;
  onClose: () => void;
}

function formatDate(s: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export function BroadcastDetailModal({ broadcastId, open, onClose }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<BroadcastDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !broadcastId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    broadcastsApi
      .get(broadcastId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(t('team.broadcasts.errorGeneric'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, broadcastId, t]);

  const totals = data
    ? {
        recipients: data.recipients.length,
        delivered: data.recipients.filter((r) => r.deliveredAt).length,
        acked: data.recipients.filter((r) => r.ackedAt).length,
        clicked: data.recipients.filter((r) => r.clickedAt).length,
      }
    : null;

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={data?.title ?? t('team.broadcasts.detailTitle')}
      size="2xl"
    >
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
        </div>
      ) : error || !data ? (
        <p className="text-sm text-red-600">{error ?? t('team.broadcasts.errorGeneric')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                (data.kind === 'POPUP'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-100 text-blue-700')
              }
            >
              {data.kind === 'POPUP'
                ? t('team.broadcasts.kindBadgePopup')
                : t('team.broadcasts.kindBadgeBar')}
            </span>
            <span
              className={
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                (data.isActive
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-500')
              }
            >
              {data.isActive
                ? t('team.broadcasts.statusActive')
                : t('team.broadcasts.statusInactive')}
            </span>
            <span className="text-[11px] text-gray-400">
              {t('team.broadcasts.sentBy', {
                name: data.createdBy?.name ?? '—',
                date: formatDate(data.createdAt),
              })}
            </span>
          </div>

          {data.imageUrl && (
            <img
              src={data.imageUrl}
              alt=""
              className="mx-auto max-h-60 w-auto rounded-xl object-contain"
            />
          )}
          {data.body && (
            <p className="whitespace-pre-wrap rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {data.body}
            </p>
          )}
          {data.linkUrl && (
            <a
              href={data.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 self-start text-xs font-semibold text-primary hover:underline"
            >
              <ExternalLink size={12} />
              {data.linkUrl}
            </a>
          )}

          {/* Stats */}
          {totals && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t('team.broadcasts.recipients')} value={totals.recipients} />
              <Stat label={t('team.broadcasts.deliveredAt')} value={totals.delivered} />
              <Stat label={t('team.broadcasts.ackedAt')} value={totals.acked} />
              <Stat label={t('team.broadcasts.clickedAt')} value={totals.clicked} />
            </div>
          )}

          {/* Per-recipient table */}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">{t('team.broadcasts.user')}</th>
                  <th className="px-3 py-2">{t('team.broadcasts.deliveredAt')}</th>
                  <th className="px-3 py-2">{t('team.broadcasts.ackedAt')}</th>
                  <th className="px-3 py-2">{t('team.broadcasts.clickedAt')}</th>
                  <th className="px-3 py-2 text-right">{t('team.broadcasts.clickCount')}</th>
                </tr>
              </thead>
              <tbody>
                {data.recipients.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {r.user.avatarUrl ? (
                          <img
                            src={r.user.avatarUrl}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">
                            {r.user.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="font-medium text-gray-700">{r.user.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Cell ts={r.deliveredAt} icon={<Eye size={10} />} />
                    </td>
                    <td className="px-3 py-2">
                      <Cell ts={r.ackedAt} icon={<Check size={10} />} />
                    </td>
                    <td className="px-3 py-2">
                      <Cell ts={r.clickedAt} icon={<ExternalLink size={10} />} />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{r.clickCount}</td>
                  </tr>
                ))}
                {data.recipients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                      {t('team.broadcasts.noRecipients')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </GlassModal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function Cell({ ts, icon }: { ts: string | null; icon: React.ReactNode }) {
  if (!ts) {
    return <span className="inline-flex items-center gap-1 text-gray-300"><X size={10} />—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      {icon}
      {formatDate(ts)}
    </span>
  );
}
