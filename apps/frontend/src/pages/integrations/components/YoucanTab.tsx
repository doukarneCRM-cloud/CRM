import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Link2 } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { integrationsApi, type Store } from '@/services/integrationsApi';
import { StoreCard } from './StoreCard';
import { AddStoreModal } from './AddStoreModal';
import { ConfigureStoreModal } from './ConfigureStoreModal';
import { ImportProductsModal } from './ImportProductsModal';
import { ImportOrdersModal } from './ImportOrdersModal';
import { OnboardingWizard } from './OnboardingWizard';

interface OAuthMessage {
  type: 'youcan-oauth';
  ok: boolean;
  storeId?: string;
  error?: string;
}

export function YoucanTab() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.INTEGRATIONS_MANAGE);

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [configStore, setConfigStore] = useState<Store | null>(null);
  const [importProductsStoreId, setImportProductsStoreId] = useState<string | null>(null);
  const [importOrdersStoreId, setImportOrdersStoreId] = useState<string | null>(null);
  const [wizardStore, setWizardStore] = useState<Store | null>(null);

  const popupRef = useRef<Window | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const justConnectedStoreIdRef = useRef<string | null>(null);

  const [reconcilingStoreId, setReconcilingStoreId] = useState<string | null>(null);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    try {
      const data = await integrationsApi.listStores();
      setStores(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as OAuthMessage;
      if (!data || data.type !== 'youcan-oauth') return;

      if (data.ok) {
        setOauthError(null);
        justConnectedStoreIdRef.current = data.storeId ?? null;
        loadStores();
      } else {
        setOauthError(data.error ?? t('integrations.youcan.oauthFailed'));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadStores, t]);

  useEffect(() => {
    const pendingId = justConnectedStoreIdRef.current;
    if (!pendingId) return;
    const connected = stores.find((s) => s.id === pendingId && s.isConnected);
    if (connected) {
      justConnectedStoreIdRef.current = null;
      setWizardStore(connected);
    }
  }, [stores]);

  const openOAuthPopup = useCallback(async (storeId: string) => {
    setOauthError(null);
    try {
      const { url } = await integrationsApi.getOAuthUrl(storeId);
      const width = 600;
      const height = 720;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      popupRef.current = window.open(
        url,
        'youcan-oauth',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
      );
      if (!popupRef.current) {
        setOauthError(t('integrations.youcan.popupBlocked'));
      }
    } catch (e: any) {
      setOauthError(e?.response?.data?.error?.message ?? t('integrations.youcan.oauthStartFailed'));
    }
  }, [t]);

  const handleStoreCreated = useCallback(
    (store: Store) => {
      loadStores();
      openOAuthPopup(store.id);
    },
    [loadStores, openOAuthPopup],
  );

  const handleToggle = async (storeId: string) => {
    try {
      await integrationsApi.toggleStore(storeId);
      loadStores();
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (storeId: string) => {
    try {
      await integrationsApi.deleteStore(storeId);
      loadStores();
    } catch {
      /* ignore */
    }
  };

  const handleReconcile = async (storeId: string) => {
    setReconcilingStoreId(storeId);
    setReconcileMessage(null);
    try {
      const r = await integrationsApi.reconcilePlaceholders(storeId);
      if (r.reconciled === 0 && r.skipped === 0) {
        setReconcileMessage(t('integrations.youcan.reconcileEmpty'));
      } else {
        setReconcileMessage(
          t('integrations.youcan.reconcileLinked', { count: r.reconciled }) +
            (r.skipped > 0 ? t('integrations.youcan.reconcileStill', { count: r.skipped }) : '') +
            (r.errors > 0 ? t('integrations.youcan.reconcileErrors', { count: r.errors }) : '') +
            t('integrations.youcan.reconcileEnd'),
        );
      }
      loadStores();
    } catch (e: any) {
      setReconcileMessage(e?.response?.data?.error?.message ?? t('integrations.youcan.reconcileFailed'));
    } finally {
      setReconcilingStoreId(null);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {t('integrations.youcan.subtitle')}
        </p>
        {canManage && (
          <CRMButton
            variant="primary"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setAddOpen(true)}
          >
            {t('integrations.youcan.addStore')}
          </CRMButton>
        )}
      </div>

      {oauthError && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {oauthError}
        </div>
      )}

      {reconcileMessage && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-xs text-primary">
          <span>{reconcileMessage}</span>
          <button
            type="button"
            onClick={() => setReconcileMessage(null)}
            className="text-primary/60 hover:text-primary"
          >
            {t('integrations.youcan.dismiss')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-gray-100 bg-gray-50" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Link2 size={24} className="text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">{t('integrations.youcan.emptyTitle')}</p>
            <p className="mt-1 text-xs text-gray-400">
              {t('integrations.youcan.emptyBody')}
            </p>
          </div>
          {canManage && (
            <CRMButton
              variant="primary"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setAddOpen(true)}
            >
              {t('integrations.youcan.addFirstStore')}
            </CRMButton>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              onConnect={() => openOAuthPopup(store.id)}
              onToggle={() => handleToggle(store.id)}
              onDelete={() => handleDelete(store.id)}
              onConfigure={() => setConfigStore(store)}
              onImportProducts={() => setImportProductsStoreId(store.id)}
              onImportOrders={() => setImportOrdersStoreId(store.id)}
              onReconcile={() => handleReconcile(store.id)}
              reconciling={reconcilingStoreId === store.id}
            />
          ))}
        </div>
      )}

      <AddStoreModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={handleStoreCreated} />
      <ConfigureStoreModal
        store={configStore}
        open={!!configStore}
        onClose={() => setConfigStore(null)}
        onUpdated={loadStores}
      />
      <ImportProductsModal
        storeId={importProductsStoreId}
        open={!!importProductsStoreId}
        onClose={() => setImportProductsStoreId(null)}
        onDone={loadStores}
      />
      <ImportOrdersModal
        storeId={importOrdersStoreId}
        open={!!importOrdersStoreId}
        onClose={() => setImportOrdersStoreId(null)}
        onDone={loadStores}
      />
      <OnboardingWizard
        store={wizardStore}
        open={!!wizardStore}
        onClose={() => setWizardStore(null)}
        onFinished={loadStores}
      />
    </>
  );
}
