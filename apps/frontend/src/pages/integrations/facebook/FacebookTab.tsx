import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Facebook, RefreshCw, Power, Trash2, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { useToastStore } from '@/store/toastStore';
import { facebookApi, type AdAccount, type OAuthCallbackResult } from '@/services/facebookApi';
import { CampaignsTable } from './CampaignsTable';
import { SpendChart } from './SpendChart';
import { InvoicesTable } from './InvoicesTable';

export function FacebookTab() {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.push);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await facebookApi.listAccounts();
      setAccounts(list);
      if (!activeAccountId && list.length > 0) {
        setActiveAccountId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Connect: open OAuth popup, listen for postMessage ────────────────────
  const handleConnect = useCallback(async () => {
    try {
      const { url } = await facebookApi.startOAuth();
      const popup = window.open(url, 'fb-oauth', 'width=600,height=720');
      if (!popup) {
        toast({ kind: 'error', title: t('integrations.facebook.popupBlocked') });
        return;
      }
      const onMessage = async (e: MessageEvent) => {
        const msg = e.data as { type?: string; data?: OAuthCallbackResult };
        if (msg?.type !== 'fb-oauth-result') return;
        window.removeEventListener('message', onMessage);
        const data = msg.data;
        if (!data?.ok || !data.accessToken || !data.accounts) {
          toast({
            kind: 'error',
            title: t('integrations.facebook.oauthFailed'),
            body: data?.error,
          });
          return;
        }
        try {
          const created = await facebookApi.connectAccounts({
            accessToken: data.accessToken,
            expiresAt: data.expiresAt ?? null,
            accounts: data.accounts.map((a) => ({
              externalId: a.externalId,
              name: a.name,
              businessId: a.businessId,
            })),
          });
          toast({
            kind: 'success',
            title: t('integrations.facebook.connected', { count: created.length }),
          });
          await refresh();
        } catch {
          toast({ kind: 'error', title: t('integrations.facebook.connectFailed') });
        }
      };
      window.addEventListener('message', onMessage);
    } catch {
      toast({ kind: 'error', title: t('integrations.facebook.connectFailed') });
    }
  }, [refresh, toast, t]);

  // ── Sync now / toggle / delete ──────────────────────────────────────────
  const handleSync = async (id: string) => {
    setBusy(id);
    try {
      const r = await facebookApi.syncNow(id);
      if (r.errors.length === 0) {
        toast({
          kind: 'success',
          title: t('integrations.facebook.syncOk', {
            spendDays: r.spendDays,
            campaigns: r.campaigns,
          }),
        });
      } else {
        toast({
          kind: 'error',
          title: t('integrations.facebook.syncWithErrors'),
          body: r.errors.join(' · '),
        });
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  const handleToggle = async (acc: AdAccount) => {
    setBusy(acc.id);
    try {
      await facebookApi.setActive(acc.id, !acc.isActive);
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  const handleDelete = async (acc: AdAccount) => {
    if (!window.confirm(t('integrations.facebook.confirmDelete', { name: acc.name }))) return;
    setBusy(acc.id);
    try {
      await facebookApi.delete(acc.id);
      await refresh();
      if (activeAccountId === acc.id) setActiveAccountId(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Top bar: connect + summary ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Facebook size={18} className="text-[#1877F2]" />
          <h2 className="text-sm font-bold text-gray-900">{t('integrations.facebook.title')}</h2>
          <span className="text-xs text-gray-400">
            {t('integrations.facebook.connectedCount', { count: accounts.filter((a) => a.isConnected).length })}
          </span>
        </div>
        <CRMButton variant="primary" size="sm" leftIcon={<Plus size={13} />} onClick={handleConnect}>
          {t('integrations.facebook.connect')}
        </CRMButton>
      </div>

      {/* ── Accounts list ──────────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-xs text-gray-400">{t('common.loading')}</p>
      ) : accounts.length === 0 ? (
        <GlassCard className="p-6 text-center">
          <Facebook size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">{t('integrations.facebook.empty')}</p>
          <p className="mt-1 text-xs text-gray-400">{t('integrations.facebook.emptyHint')}</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {accounts.map((a) => {
            const isActiveCard = activeAccountId === a.id;
            return (
              <GlassCard
                key={a.id}
                className={`cursor-pointer p-3 transition-shadow ${
                  isActiveCard ? 'ring-2 ring-[#1877F2]' : 'hover:shadow-card'
                }`}
              >
                <div className="flex items-start justify-between gap-2" onClick={() => setActiveAccountId(a.id)}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-gray-900">{a.name}</span>
                      {a.isConnected ? (
                        <CheckCircle2 size={11} className="text-emerald-600" />
                      ) : (
                        <AlertTriangle size={11} className="text-amber-600" />
                      )}
                    </div>
                    <p className="truncate text-[10px] text-gray-400">{a.externalId}</p>
                    {a.lastError && (
                      <p className="mt-1 truncate text-[10px] text-red-600" title={a.lastError}>
                        {a.lastError}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-gray-400">
                      {a.lastSyncAt
                        ? t('integrations.facebook.lastSync', {
                            time: new Date(a.lastSyncAt).toLocaleString(),
                          })
                        : t('integrations.facebook.neverSynced')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleSync(a.id);
                      }}
                      disabled={busy === a.id || !a.isConnected}
                      className="flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-[11px] text-gray-500 hover:border-primary hover:text-primary disabled:opacity-50"
                      title={t('integrations.facebook.syncNow') as string}
                    >
                      <RefreshCw size={11} className={busy === a.id ? 'animate-spin' : ''} />
                      {t('integrations.facebook.syncNow')}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggle(a);
                      }}
                      disabled={busy === a.id}
                      className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] disabled:opacity-50 ${
                        a.isActive
                          ? 'border-gray-200 text-gray-500 hover:border-amber-400 hover:text-amber-600'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      <Power size={11} />
                      {a.isActive ? t('integrations.facebook.pause') : t('integrations.facebook.resume')}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(a);
                      }}
                      disabled={busy === a.id}
                      className="flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-[11px] text-gray-500 hover:border-red-400 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* ── Detail subviews ────────────────────────────────────────────────── */}
      {activeAccountId && (
        <div className="flex flex-col gap-3">
          <SpendChart accountId={activeAccountId} />
          <CampaignsTable accountId={activeAccountId} />
          <InvoicesTable accountId={activeAccountId} />
        </div>
      )}
    </div>
  );
}
