/**
 * Account card — shown in the V2 tab list. One row per (carrier × hub).
 * Compact health summary with rotate-secret + edit affordances.
 */

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Settings,
  Trash2,
  Activity,
  Truck,
  Upload,
  Stethoscope,
  Copy,
} from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import {
  coliixV2Api,
  type CarrierAccount,
  type AccountHealth,
} from '@/services/coliixV2Api';
import { CitiesCsvModal } from './CitiesCsvModal';
import { RepushBrokenModal } from './RepushBrokenModal';

interface Props {
  account: CarrierAccount;
  onConfigure: () => void;
  onDeleted: () => void;
  onChanged: (updated: CarrierAccount) => void;
}

export function AccountCard({ account, onConfigure, onDeleted, onChanged }: Props) {
  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [diagnostic, setDiagnostic] = useState<unknown>(null);
  const [repushOpen, setRepushOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      coliixV2Api
        .health(account.id)
        .then((h) => {
          if (!cancelled) setHealth(h);
        })
        .catch(() => {
          /* silent */
        });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [account.id]);

  async function handleToggle() {
    setBusy('toggle');
    try {
      const updated = await coliixV2Api.updateAccount(account.id, {
        isActive: !account.isActive,
      });
      onChanged(updated);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete the ${account.hubLabel} account? Active shipments must be cleared first.`)) return;
    setBusy('delete');
    try {
      await coliixV2Api.deleteAccount(account.id);
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleDiagnostic() {
    setBusy('diagnostic');
    try {
      const d = await coliixV2Api.diagnostic(account.id);
      setDiagnostic(d);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Diagnostic failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleDiagnoseOrder() {
    const ref = window.prompt(
      'Enter the order reference (e.g. ORD-26-12345). The system will dump everything it knows about that order’s V2 pipeline.',
    );
    if (!ref?.trim()) return;
    setBusy('diagnoseOrder');
    try {
      const d = await coliixV2Api.diagnoseOrder(ref.trim());
      setDiagnostic(d);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Order diagnostic failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleForceRefreshAll() {
    if (
      !window.confirm(
        'Force-poll every non-terminal V2 shipment on this account NOW (bypassing the adaptive cadence)? Useful when many parcels look frozen.',
      )
    )
      return;
    setBusy('forceRefresh');
    try {
      const r = await coliixV2Api.forceRefreshAll(account.id);
      alert(`${r.scheduled} shipment(s) queued for immediate poll. They will refresh within ~60 seconds.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Force refresh failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleMigrate() {
    if (!window.confirm(
      'Mirror every in-flight V1 order onto this V2 account so Coliix webhooks can update them instantly?\n\n' +
      'Idempotent — safe to re-run.'
    )) return;
    setBusy('migrate');
    try {
      const r = await coliixV2Api.migrateV1Orders(account.id);
      alert(
        `Scanned ${r.scanned}\n` +
        `Migrated ${r.migrated}\n` +
        `Already migrated: ${r.skippedAlreadyMigrated}\n` +
        `Missing data: ${r.skippedNoCustomerData}\n` +
        (r.errors.length ? `Errors:\n${r.errors.slice(0, 5).map((e) => `  • ${e.reference}: ${e.reason}`).join('\n')}` : ''),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setBusy(null);
    }
  }

  const lastWebhookText = health?.lastWebhookAt
    ? new Date(health.lastWebhookAt).toLocaleString()
    : 'No webhook yet';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{account.hubLabel}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                account.isActive
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {account.isActive ? 'Active' : 'Disabled'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Key: <span className="font-mono">{account.apiKeyMask ?? '—'}</span> ·{' '}
            <span className="text-gray-400">{account.apiBaseUrl}</span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <CRMButton size="sm" variant="ghost" onClick={onConfigure} leftIcon={<Settings className="h-4 w-4" />}>
            Configure
          </CRMButton>
          <CRMButton
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            loading={busy === 'delete'}
            leftIcon={<Trash2 className="h-4 w-4 text-red-500" />}
          >
            <span className="text-red-500">Delete</span>
          </CRMButton>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          icon={<Activity className="h-4 w-4" />}
          label="Webhooks 1h / 24h"
          value={
            health
              ? `${health.count1h.toLocaleString()} / ${health.count24h.toLocaleString()}`
              : '—'
          }
        />
        <Metric
          icon={
            health?.lastWebhookOk === false ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )
          }
          label="Last webhook"
          value={lastWebhookText}
        />
        <Metric
          icon={<RefreshCw className="h-4 w-4" />}
          label="Last health check"
          value={
            account.lastHealthAt
              ? new Date(account.lastHealthAt).toLocaleString()
              : 'Never'
          }
        />
      </div>

      {health?.recentRejections.length ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
          <div className="mb-1 font-medium text-amber-800">
            Recent rejections (last 24 h)
          </div>
          <ul className="space-y-0.5 text-amber-900">
            {health.recentRejections.slice(0, 3).map((r, i) => (
              <li key={i}>
                <span className="font-mono text-[10px]">
                  {new Date(r.createdAt).toLocaleTimeString()}
                </span>{' '}
                — HTTP {r.statusCode}: {r.reason ?? '—'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <CRMButton
          size="sm"
          variant="ghost"
          onClick={handleDiagnoseOrder}
          loading={busy === 'diagnoseOrder'}
          leftIcon={<Stethoscope className="h-4 w-4" />}
        >
          Diagnose order
        </CRMButton>
        <CRMButton
          size="sm"
          variant="ghost"
          onClick={handleForceRefreshAll}
          loading={busy === 'forceRefresh'}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Force refresh all
        </CRMButton>
        <CRMButton
          size="sm"
          variant="ghost"
          onClick={handleDiagnostic}
          loading={busy === 'diagnostic'}
          leftIcon={<Stethoscope className="h-4 w-4" />}
        >
          Diagnostic
        </CRMButton>
        <CRMButton
          size="sm"
          variant="ghost"
          onClick={() => setCsvOpen(true)}
          leftIcon={<Upload className="h-4 w-4" />}
        >
          Import cities
        </CRMButton>
        <CRMButton
          size="sm"
          variant="ghost"
          onClick={handleMigrate}
          loading={busy === 'migrate'}
          leftIcon={<Truck className="h-4 w-4" />}
        >
          Migrate V1 orders
        </CRMButton>
        <CRMButton
          size="sm"
          variant="ghost"
          onClick={() => setRepushOpen(true)}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Re-push broken
        </CRMButton>
        <CRMButton
          size="sm"
          variant={account.isActive ? 'secondary' : 'primary'}
          onClick={handleToggle}
          loading={busy === 'toggle'}
        >
          {account.isActive ? 'Pause' : 'Activate'}
        </CRMButton>
      </div>

      <CitiesCsvModal
        open={csvOpen}
        accountId={account.id}
        onClose={() => setCsvOpen(false)}
      />

      <RepushBrokenModal
        open={repushOpen}
        accountId={account.id}
        onClose={() => setRepushOpen(false)}
      />

      <GlassModal
        open={diagnostic !== null}
        onClose={() => setDiagnostic(null)}
        title="V2 Diagnostic"
        size="2xl"
      >
        <p className="mb-2 text-xs text-gray-500">
          Copy this JSON and send it back so the bug can be diagnosed remotely.
        </p>
        <textarea
          readOnly
          value={JSON.stringify(diagnostic, null, 2)}
          className="h-96 w-full rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="mt-3 flex justify-end gap-2">
          <CRMButton
            size="sm"
            variant="ghost"
            leftIcon={<Copy className="h-4 w-4" />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
                alert('Copied');
              } catch {
                alert('Could not copy — select manually');
              }
            }}
          >
            Copy
          </CRMButton>
        </div>
      </GlassModal>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}
