/**
 * Coliix V2 connect wizard. Four steps:
 *   1. Credentials (hub label + API key)
 *   2. Test connection
 *   3. Webhook URL (copy + verify a real test event)
 *   4. Sync cities
 *
 * Resumable — each step's success persists on the server, so closing the
 * modal mid-flow and re-opening continues from the last completed step.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Globe,
  MapPin,
  PartyPopper,
} from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { GlassModal } from '@/components/ui/GlassModal';
import {
  coliixV2Api,
  type CarrierAccount,
} from '@/services/coliixV2Api';
import { apiErrorMessage } from '@/lib/apiError';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
type StepId = 1 | 2 | 3 | 4;

interface Props {
  open: boolean;
  initialAccount?: CarrierAccount;
  onClose: () => void;
  onComplete: (account: CarrierAccount) => void;
}

export function ConnectWizard({ open, initialAccount, onClose, onComplete }: Props) {
  const [step, setStep] = useState<StepId>(1);
  const [account, setAccount] = useState<CarrierAccount | null>(initialAccount ?? null);
  const [hubLabel, setHubLabel] = useState(initialAccount?.hubLabel ?? '');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [webhookOk, setWebhookOk] = useState(false);
  const [citySync, setCitySync] = useState<{ total: number; inserted: number; updated: number; removed: number } | null>(null);

  const webhookUrl = useMemo(
    () =>
      account
        ? `${BACKEND_ORIGIN}/api/v1/coliixv2/webhook/${account.id}/${account.webhookSecret}`
        : '',
    [account],
  );

  useEffect(() => {
    if (open && initialAccount) {
      setAccount(initialAccount);
      setHubLabel(initialAccount.hubLabel);
      setStep(initialAccount.lastHealthAt ? 3 : 2);
    }
    if (!open) {
      // Reset state on close so re-opening is clean
      setStep(1);
      setApiKey('');
      setHubLabel('');
      setAccount(null);
      setError(null);
      setTestResult(null);
      setWebhookOk(false);
      setCitySync(null);
      setCopied(false);
    }
  }, [open, initialAccount]);

  // Step 3 — poll the health endpoint to detect a real test webhook hit.
  useEffect(() => {
    if (step !== 3 || !account) return;
    let cancelled = false;
    let lastSeenAt: string | null = account.lastHealthAt;
    const tick = async () => {
      try {
        const h = await coliixV2Api.health(account.id);
        if (cancelled) return;
        if (h.lastWebhookAt && h.lastWebhookAt !== lastSeenAt) {
          // New webhook arrived since we opened this step
          setWebhookOk(true);
        }
        lastSeenAt = h.lastWebhookAt ?? lastSeenAt;
      } catch {
        // silent — keep polling
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, account]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleStep1Save() {
    setBusy(true);
    setError(null);
    try {
      let acc: CarrierAccount;
      if (account) {
        acc = await coliixV2Api.updateAccount(account.id, {
          hubLabel,
          apiKey: apiKey || undefined,
        });
      } else {
        acc = await coliixV2Api.createAccount({ hubLabel, apiKey });
      }
      setAccount(acc);
      setApiKey('');
      setStep(2);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save credentials'));
    } finally {
      setBusy(false);
    }
  }

  async function handleStep2Test() {
    if (!account) return;
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const r = await coliixV2Api.testAccount(account.id);
      setTestResult(r);
      if (r.ok) {
        // Auto-advance after a beat — gives the user time to see the green tick.
        setTimeout(() => setStep(3), 600);
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Test connection failed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function handleStep4Sync() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const result = await coliixV2Api.syncCities(account.id);
      setCitySync(result);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not sync cities'));
    } finally {
      setBusy(false);
    }
  }

  // Bridge to V1's ShippingCity table — admins have already curated city +
  // zone + delivery price there. One click to inherit it for V2.
  async function handleStep4ImportV1() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const result = await coliixV2Api.importV1Cities(account.id);
      setCitySync({ ...result, removed: 0 });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not import V1 cities'));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const acc = await coliixV2Api.updateAccount(account.id, { isActive: true });
      onComplete(acc);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not activate account'));
    } finally {
      setBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <GlassModal open={open} onClose={onClose} title="Connect Coliix" size="2xl">
      <Stepper step={step} />

      <div className="mt-6 min-h-[280px]">
        {step === 1 && (
          <Step
            icon={<KeyRound className="h-5 w-5" />}
            title="Add your Coliix API key"
            description="From Coliix → Mon compte → Afficher la clé API. We store it encrypted."
          >
            <div className="space-y-3">
              <CRMInput
                label="Hub label"
                placeholder="Agadir, Casablanca, …"
                value={hubLabel}
                onChange={(e) => setHubLabel(e.target.value)}
                hint="Used in the UI to tell hubs apart. Free-form."
                required
              />
              <CRMInput
                label="API key"
                placeholder={account ? 'Leave blank to keep current key' : '294f3c-54de6e-d0217d-…'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                hint="UUID-shaped string Coliix shows on Mon compte."
                required={!account}
              />
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step
            icon={<Globe className="h-5 w-5" />}
            title="Test the connection"
            description="We send a sentinel `track` call. Coliix's response tells us whether the key works."
          >
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
              {testResult ? (
                <div
                  className={`flex items-center gap-2 ${
                    testResult.ok ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" />
                  )}
                  <span className="text-sm font-medium">{testResult.message}</span>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Click the button below to run the test.</p>
              )}
            </div>
          </Step>
        )}

        {step === 3 && account && (
          <Step
            icon={<Globe className="h-5 w-5" />}
            title="Paste this webhook URL into Coliix"
            description="Coliix → Mon compte → Webhook field. Then change a parcel state to send a test event."
          >
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <code className="block break-all font-mono text-xs text-gray-800">{webhookUrl}</code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy URL
                    </>
                  )}
                </button>
              </div>
              <div
                className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                  webhookOk
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {webhookOk ? (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    <span>Webhook received — Coliix can reach us.</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Waiting for Coliix to call us. Trigger any test event from their dashboard.</span>
                  </>
                )}
              </div>
            </div>
          </Step>
        )}

        {step === 4 && account && (
          <Step
            icon={<MapPin className="h-5 w-5" />}
            title="Delivery cities"
            description="Used to validate every order's city + show the delivery price before pushing."
          >
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                {citySync ? (
                  <div className="text-sm text-gray-700">
                    Loaded <strong>{citySync.total}</strong> cities ({citySync.inserted} new,{' '}
                    {citySync.updated} updated{citySync.removed ? `, ${citySync.removed} removed` : ''}).
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Pick a source. Re-runnable any time from the account card.
                  </p>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleStep4ImportV1}
                  disabled={busy}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                >
                  <div className="text-sm font-medium text-gray-900">Import from CRM cities</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    Use your existing list (with delivery prices). Fastest.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleStep4Sync}
                  disabled={busy}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                >
                  <div className="text-sm font-medium text-gray-900">Sync from Coliix</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    Pull "Liste Ville et zone" from Coliix. No prices.
                  </div>
                </button>
              </div>
            </div>
          </Step>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
        <CRMButton
          variant="ghost"
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as StepId) : s))}
          disabled={step === 1 || busy}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
        >
          Back
        </CRMButton>

        <div className="flex items-center gap-2">
          {step === 1 && (
            <CRMButton
              onClick={handleStep1Save}
              disabled={!hubLabel || (!account && !apiKey) || busy}
              loading={busy}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Save & continue
            </CRMButton>
          )}
          {step === 2 && (
            <CRMButton onClick={handleStep2Test} loading={busy} disabled={busy}>
              {testResult?.ok ? 'Continue' : 'Test connection'}
            </CRMButton>
          )}
          {step === 3 && (
            <CRMButton
              onClick={() => setStep(4)}
              variant={webhookOk ? 'primary' : 'secondary'}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              {webhookOk ? 'Continue' : 'Skip for now'}
            </CRMButton>
          )}
          {step === 4 && (
            <CRMButton
              onClick={handleFinish}
              disabled={busy}
              loading={busy}
              rightIcon={<PartyPopper className="h-4 w-4" />}
            >
              {citySync ? 'Activate' : 'Skip & activate'}
            </CRMButton>
          )}
        </div>
      </div>
    </GlassModal>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stepper({ step }: { step: StepId }) {
  const steps = ['Key', 'Test', 'Webhook', 'Cities'];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const idx = (i + 1) as StepId;
        const active = idx === step;
        const done = idx < step;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? 'bg-emerald-100 text-emerald-700'
                  : active
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : idx}
            </div>
            <div
              className={`text-xs font-medium ${
                active ? 'text-gray-900' : done ? 'text-gray-700' : 'text-gray-400'
              }`}
            >
              {label}
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-1 h-px flex-1 ${done ? 'bg-emerald-200' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
