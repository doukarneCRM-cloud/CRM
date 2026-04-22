import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  automationApi,
  type AutomationTrigger,
  type MessageTemplate,
} from '@/services/automationApi';
import { VariableChips } from '../components/VariableChips';

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  confirmation_confirmed: 'Order confirmed',
  confirmation_cancelled: 'Order cancelled',
  confirmation_unreachable: 'Client unreachable',
  shipping_picked_up: 'Picked up',
  shipping_in_transit: 'In transit',
  shipping_out_for_delivery: 'Out for delivery',
  shipping_delivered: 'Delivered',
  shipping_returned: 'Returned',
  shipping_return_validated: 'Return validated',
  commission_paid: 'Commission paid',
};

const SAMPLE_CTX = {
  customer: { name: 'Ahmed', phone: '+212600000000', city: 'Casablanca' },
  order: { reference: 'ORD-12034', total: '349', shippingPrice: '30', itemCount: 1 },
  product: { name: 'Caftan Soirée' },
  variant: { size: 'M', color: 'Noir' },
  agent: { name: 'Sara', phone: '+212611111111' },
  commission: { amount: '1250', orderCount: 24, periodFrom: '2026-04-01', periodTo: '2026-04-15' },
};

function renderPreview(body: string): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const v = path.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), SAMPLE_CTX);
    return v == null ? '' : String(v);
  });
}

export function TemplatesTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.AUTOMATION_MANAGE);
  const pushToast = useToastStore((s) => s.push);

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { enabled: boolean; body: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await automationApi.listTemplates();
      setTemplates(rows);
      const initial: Record<string, { enabled: boolean; body: string }> = {};
      for (const t of rows) initial[t.trigger] = { enabled: t.enabled, body: t.body };
      setDrafts(initial);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-56 rounded-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {templates.map((t) => {
        const draft = drafts[t.trigger] ?? { enabled: t.enabled, body: t.body };
        const dirty = draft.body !== t.body || draft.enabled !== t.enabled;
        const setDraft = (next: Partial<{ enabled: boolean; body: string }>) =>
          setDrafts((d) => ({ ...d, [t.trigger]: { ...draft, ...next } }));

        const save = async () => {
          setSaving(t.trigger);
          try {
            const updated = await automationApi.updateTemplate(t.trigger, {
              enabled: draft.enabled,
              body: draft.body,
            });
            setTemplates((list) => list.map((x) => (x.trigger === t.trigger ? updated : x)));
            pushToast({ kind: 'success', title: 'Template saved' });
          } catch {
            pushToast({ kind: 'error', title: 'Failed to save template' });
          } finally {
            setSaving(null);
          }
        };

        return (
          <TemplateCard
            key={t.trigger}
            template={t}
            draft={draft}
            dirty={dirty}
            saving={saving === t.trigger}
            canManage={canManage}
            onChange={setDraft}
            onSave={save}
          />
        );
      })}
    </div>
  );
}

function TemplateCard({
  template,
  draft,
  dirty,
  saving,
  canManage,
  onChange,
  onSave,
}: {
  template: MessageTemplate;
  draft: { enabled: boolean; body: string };
  dirty: boolean;
  saving: boolean;
  canManage: boolean;
  onChange: (next: Partial<{ enabled: boolean; body: string }>) => void;
  onSave: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange({ body: (draft.body || '') + token });
      return;
    }
    const start = el.selectionStart ?? draft.body.length;
    const end = el.selectionEnd ?? draft.body.length;
    const next = draft.body.slice(0, start) + token + draft.body.slice(end);
    onChange({ body: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const preview = useMemo(() => renderPreview(draft.body), [draft.body]);

  return (
    <GlassCard padding="md" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {TRIGGER_LABELS[template.trigger]}
          </h3>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-400">
            {template.trigger}
          </p>
        </div>
        <Toggle
          checked={draft.enabled}
          onChange={(v) => onChange({ enabled: v })}
          disabled={!canManage}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-gray-500">Variables (click to insert)</p>
        <VariableChips trigger={template.trigger} onInsert={insertAtCursor} />
      </div>

      <textarea
        ref={textareaRef}
        value={draft.body}
        onChange={(e) => onChange({ body: e.target.value })}
        disabled={!canManage}
        rows={5}
        className="w-full resize-y rounded-btn border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50"
        placeholder="Message body..."
      />

      <div className="rounded-btn border border-dashed border-gray-200 bg-gray-50 p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Preview
        </p>
        <p className="whitespace-pre-wrap text-sm text-gray-700">
          {preview || <span className="text-gray-400">Empty</span>}
        </p>
      </div>

      {canManage && (
        <div className="flex justify-end">
          <CRMButton
            size="sm"
            leftIcon={<Save size={14} />}
            disabled={!dirty || saving}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save'}
          </CRMButton>
        </div>
      )}
    </GlassCard>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-gray-300',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}
