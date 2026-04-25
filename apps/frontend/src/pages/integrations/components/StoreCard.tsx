import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link2, Unlink, Power, Trash2, Package, ShoppingCart,
  AlertCircle, CheckCircle2, Clock, Settings2, Wand2, Loader2, Zap, ZapOff,
} from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { cn } from '@/lib/cn';
import type { Store } from '@/services/integrationsApi';

interface Props {
  store: Store;
  onConnect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onConfigure: () => void;
  onImportProducts: () => void;
  onImportOrders: () => void;
  onReconcile: () => void;
  onToggleAutoSync: () => void;
  reconciling?: boolean;
  togglingAutoSync?: boolean;
}

export function StoreCard({
  store,
  onConnect,
  onToggle,
  onDelete,
  onConfigure,
  onImportProducts,
  onImportOrders,
  onReconcile,
  onToggleAutoSync,
  reconciling,
  togglingAutoSync,
}: Props) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    if (!window.confirm(t('integrations.storeCard.deleteConfirm', { name: store.name }))) return;
    setDeleting(true);
    onDelete();
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border bg-white p-5 transition-shadow hover:shadow-card',
        store.isActive ? 'border-gray-100' : 'border-dashed border-gray-200 opacity-70',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            store.isConnected ? 'bg-emerald-50' : 'bg-gray-100',
          )}>
            {store.isConnected ? (
              <Link2 size={18} className="text-emerald-600" />
            ) : (
              <Unlink size={18} className="text-gray-400" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">{store.name}</h3>
            {store.slug && (
              <p className="text-[11px] text-gray-400">{store.slug}.youcan.shop</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[10px] font-semibold',
            store.isConnected
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-gray-100 text-gray-500',
          )}>
            {store.isConnected ? (
              <><CheckCircle2 size={9} /> {t('integrations.storeCard.connected')}</>
            ) : (
              <><AlertCircle size={9} /> {t('integrations.storeCard.disconnected')}</>
            )}
          </span>
          {!store.isActive && (
            <span className="inline-flex items-center gap-1 rounded-badge bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
              {t('integrations.storeCard.storeDisabled')}
            </span>
          )}
          {store.isConnected && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[10px] font-semibold',
                store.autoSyncEnabled
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700',
              )}
              title={
                store.autoSyncEnabled
                  ? t('integrations.storeCard.autoSyncOnTooltip')
                  : t('integrations.storeCard.autoSyncOffTooltip')
              }
            >
              {store.autoSyncEnabled ? (
                <><Zap size={9} /> {t('integrations.storeCard.autoSyncOn')}</>
              ) : (
                <><ZapOff size={9} /> {t('integrations.storeCard.autoSyncOff')}</>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {store.lastError && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
          <p className="text-[11px] text-red-700">{store.lastError}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center rounded-xl bg-gray-50 py-2">
          <Package size={14} className="text-gray-400" />
          <span className="mt-1 text-sm font-bold text-gray-900">{store._count.products}</span>
          <span className="text-[9px] uppercase tracking-wide text-gray-400">{t('integrations.storeCard.products')}</span>
        </div>
        <div className="flex flex-col items-center rounded-xl bg-gray-50 py-2">
          <ShoppingCart size={14} className="text-gray-400" />
          <span className="mt-1 text-sm font-bold text-gray-900">{store._count.orders}</span>
          <span className="text-[9px] uppercase tracking-wide text-gray-400">{t('integrations.storeCard.orders')}</span>
        </div>
        <div className="flex flex-col items-center rounded-xl bg-gray-50 py-2">
          <Clock size={14} className="text-gray-400" />
          <span className="mt-1 text-[10px] font-semibold text-gray-600">
            {store.lastSyncAt
              ? new Date(store.lastSyncAt).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })
              : t('integrations.storeCard.never')}
          </span>
          <span className="text-[9px] uppercase tracking-wide text-gray-400">{t('integrations.storeCard.lastSync')}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
        {!store.isConnected ? (
          <CRMButton variant="primary" size="sm" leftIcon={<Link2 size={12} />} onClick={onConnect} className="w-full">
            {t('integrations.storeCard.connect')}
          </CRMButton>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <CRMButton variant="secondary" size="sm" leftIcon={<Package size={12} />} onClick={onImportProducts}>
                {t('integrations.storeCard.importProducts')}
              </CRMButton>
              <CRMButton variant="secondary" size="sm" leftIcon={<ShoppingCart size={12} />} onClick={onImportOrders}>
                {t('integrations.storeCard.importOrders')}
              </CRMButton>
            </div>
            <CRMButton variant="ghost" size="sm" leftIcon={<Settings2 size={12} />} onClick={onConfigure} className="w-full">
              {t('integrations.storeCard.configure')}
            </CRMButton>
            <CRMButton
              variant="ghost"
              size="sm"
              leftIcon={
                togglingAutoSync ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : store.autoSyncEnabled ? (
                  <ZapOff size={12} />
                ) : (
                  <Zap size={12} />
                )
              }
              onClick={onToggleAutoSync}
              disabled={togglingAutoSync}
              className={cn(
                'w-full',
                store.autoSyncEnabled
                  ? 'text-amber-700 hover:bg-amber-50'
                  : 'text-emerald-700 hover:bg-emerald-50',
              )}
              title={
                store.autoSyncEnabled
                  ? t('integrations.storeCard.disableAutoSyncTitle')
                  : t('integrations.storeCard.enableAutoSyncTitle')
              }
            >
              {store.autoSyncEnabled
                ? t('integrations.storeCard.disableAutoSync')
                : t('integrations.storeCard.enableAutoSync')}
            </CRMButton>
            <CRMButton
              variant="ghost"
              size="sm"
              leftIcon={reconciling ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              onClick={onReconcile}
              disabled={reconciling}
              className="w-full text-primary hover:bg-primary/5"
              title={t('integrations.storeCard.relinkTitle')}
            >
              {reconciling ? t('integrations.storeCard.relinking') : t('integrations.storeCard.relink')}
            </CRMButton>
          </>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <CRMButton
            variant="ghost"
            size="sm"
            leftIcon={<Power size={12} />}
            onClick={onToggle}
            className={cn(store.isActive ? 'text-gray-500 hover:text-red-600' : 'text-emerald-600')}
          >
            {store.isActive ? t('integrations.storeCard.disable') : t('integrations.storeCard.enable')}
          </CRMButton>
          <CRMButton
            variant="ghost"
            size="sm"
            leftIcon={<Trash2 size={12} />}
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-500 hover:text-red-700"
          >
            {t('integrations.storeCard.delete')}
          </CRMButton>
        </div>
      </div>
    </div>
  );
}
