/**
 * Coliix V2 tab — top-level page inside the Integrations module. Lists carrier
 * accounts (one per hub), launches the connect wizard, opens the mappings
 * editor. Replaces nothing — V1 stays alongside.
 */

import { useEffect, useState } from 'react';
import { Plus, ListTree, Loader2, AlertTriangle } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { coliixV2Api, type CarrierAccount } from '@/services/coliixV2Api';
import { apiErrorMessage } from '@/lib/apiError';
import { ConnectWizard } from './ConnectWizard';
import { AccountCard } from './AccountCard';
import { MappingsModal } from './MappingsModal';

export function ColiixV2Tab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.INTEGRATIONS_MANAGE);

  const [accounts, setAccounts] = useState<CarrierAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CarrierAccount | undefined>(undefined);
  const [mappingsOpen, setMappingsOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const list = await coliixV2Api.listAccounts();
      setAccounts(list);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load Coliix V2 accounts'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openWizardForNew() {
    setEditingAccount(undefined);
    setWizardOpen(true);
  }

  function openWizardForEdit(acc: CarrierAccount) {
    setEditingAccount(acc);
    setWizardOpen(true);
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Coliix V2</h2>
          <p className="text-xs text-gray-500">
            Multi-hub, idempotent, real-time. Webhook-first ingestion with adaptive polling fallback.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CRMButton
            variant="ghost"
            size="sm"
            onClick={() => setMappingsOpen(true)}
            leftIcon={<ListTree className="h-4 w-4" />}
          >
            Mappings
          </CRMButton>
          {canManage && (
            <CRMButton size="sm" onClick={openWizardForNew} leftIcon={<Plus className="h-4 w-4" />}>
              Connect a hub
            </CRMButton>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !accounts || accounts.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-12 text-center">
          <h3 className="text-sm font-semibold text-gray-700">No hubs connected yet</h3>
          <p className="mt-1 text-xs text-gray-500">
            Add a hub to start pushing orders to Coliix V2 and receiving live status updates.
          </p>
          {canManage && (
            <CRMButton
              className="mt-4"
              size="sm"
              onClick={openWizardForNew}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Connect first hub
            </CRMButton>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onConfigure={() => openWizardForEdit(acc)}
              onChanged={(u) =>
                setAccounts((prev) => prev?.map((a) => (a.id === u.id ? u : a)) ?? null)
              }
              onDeleted={() => load()}
            />
          ))}
        </div>
      )}

      <ConnectWizard
        open={wizardOpen}
        initialAccount={editingAccount}
        onClose={() => setWizardOpen(false)}
        onComplete={(acc) => {
          setWizardOpen(false);
          setAccounts((prev) => {
            if (!prev) return [acc];
            const exists = prev.find((a) => a.id === acc.id);
            return exists ? prev.map((a) => (a.id === acc.id ? acc : a)) : [...prev, acc];
          });
        }}
      />
      <MappingsModal open={mappingsOpen} onClose={() => setMappingsOpen(false)} />
    </div>
  );
}
