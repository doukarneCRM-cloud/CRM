import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Plus, Save, Trash2 } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  automationApi,
  type AutomationTrigger,
  type ColiixStateTemplate,
  type MessageTemplate,
} from '@/services/automationApi';
import { coliixApi } from '@/services/providersApi';
import { VariableChips, CLIENT_BASE_CHIPS } from '../components/VariableChips';

function triggerLabel(t: TFunction, trigger: AutomationTrigger): string {
  return t(`automation.triggersLong.${trigger}`);
}

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
  const { t } = useTranslation();
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
      for (const tpl of rows) initial[tpl.trigger] = { enabled: tpl.enabled, body: tpl.body };
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
    <div className="flex flex-col gap-6">
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {templates.map((tpl) => {
        const draft = drafts[tpl.trigger] ?? { enabled: tpl.enabled, body: tpl.body };
        const dirty = draft.body !== tpl.body || draft.enabled !== tpl.enabled;
        const setDraft = (next: Partial<{ enabled: boolean; body: string }>) =>
          setDrafts((d) => ({ ...d, [tpl.trigger]: { ...draft, ...next } }));

        const save = async () => {
          setSaving(tpl.trigger);
          try {
            const updated = await automationApi.updateTemplate(tpl.trigger, {
              enabled: draft.enabled,
              body: draft.body,
            });
            setTemplates((list) => list.map((x) => (x.trigger === tpl.trigger ? updated : x)));
            pushToast({ kind: 'success', title: t('automation.templates.saved') });
          } catch {
            pushToast({ kind: 'error', title: t('automation.templates.saveFailed') });
          } finally {
            setSaving(null);
          }
        };

        return (
          <TemplateCard
            key={tpl.trigger}
            template={tpl}
            draft={draft}
            dirty={dirty}
            saving={saving === tpl.trigger}
            canManage={canManage}
            onChange={setDraft}
            onSave={save}
          />
        );
      })}
    </div>

      <ColiixStateTemplatesSection canManage={canManage} />
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
  const { t } = useTranslation();
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
            {triggerLabel(t, template.trigger)}
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
        <p className="text-xs font-medium text-gray-500">{t('automation.templates.variablesHint')}</p>
        <VariableChips trigger={template.trigger} onInsert={insertAtCursor} />
      </div>

      <textarea
        ref={textareaRef}
        value={draft.body}
        onChange={(e) => onChange({ body: e.target.value })}
        disabled={!canManage}
        rows={5}
        className="w-full resize-y rounded-btn border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50"
        placeholder={t('automation.templates.bodyPlaceholder')}
      />

      <div className="rounded-btn border border-dashed border-gray-200 bg-gray-50 p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {t('automation.templates.preview')}
        </p>
        <p className="whitespace-pre-wrap text-sm text-gray-700">
          {preview || <span className="text-gray-400">{t('automation.templates.empty')}</span>}
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
            {saving ? t('automation.templates.saving') : t('automation.templates.save')}
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

// ─── Coliix-state-keyed templates ──────────────────────────────────────────
// Custom templates pinned to Coliix's literal status wordings. The
// dropdown is populated from coliixApi.states() (= wordings actually
// present on orders) plus a free-text input so the operator can pin a
// template to a wording that hasn't appeared yet — when Coliix later
// flips a parcel to it, the dispatcher fires the matching template.

function ColiixStateTemplatesSection({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [items, setItems] = useState<ColiixStateTemplate[]>([]);
  const [knownStates, setKnownStates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // New-template form state
  const [newState, setNewState] = useState('');
  const [customState, setCustomState] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const newBodyRef = useRef<HTMLTextAreaElement>(null);

  // Per-row edit state
  const [drafts, setDrafts] = useState<Record<string, { body: string; enabled: boolean }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const editRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Insert a `{{scope.key}}` token at the textarea's current cursor (or at
  // the end if no element / no selection). Mirrors the helper used by the
  // legacy TemplateCard so chips behave identically here.
  const insertAt = (
    el: HTMLTextAreaElement | null | undefined,
    current: string,
    token: string,
    setBody: (s: string) => void,
  ) => {
    if (!el) {
      setBody((current ?? '') + token);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpls, states] = await Promise.all([
        automationApi.listColiixTemplates(),
        coliixApi.states().catch(() => []),
      ]);
      setItems(tpls);
      setKnownStates(states.map((s) => s.value));
      const d: Record<string, { body: string; enabled: boolean }> = {};
      for (const it of tpls) d[it.id] = { body: it.body, enabled: it.enabled };
      setDrafts(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Statuses that don't already have a template — those are the ones the
  // dropdown should propose. Existing templates can still be edited via
  // the row below, no need to re-pick them in the picker.
  const taken = useMemo(() => new Set(items.map((i) => i.coliixRawState)), [items]);
  const pickable = useMemo(
    () => knownStates.filter((s) => !taken.has(s)).sort((a, b) => a.localeCompare(b, 'fr')),
    [knownStates, taken],
  );

  const resolvedNewState = (customState.trim() || newState.trim()).trim();
  const canCreate =
    canManage && !creating && resolvedNewState.length > 0 && newBody.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      await automationApi.upsertColiixTemplate({
        coliixRawState: resolvedNewState,
        body: newBody,
        enabled: newEnabled,
      });
      setNewState('');
      setCustomState('');
      setNewBody('');
      setNewEnabled(true);
      await load();
      pushToast({ kind: 'success', title: t('automation.templates.coliix.created') });
    } catch {
      pushToast({ kind: 'error', title: t('automation.templates.saveFailed') });
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (item: ColiixStateTemplate) => {
    const draft = drafts[item.id];
    if (!draft) return;
    setSavingId(item.id);
    try {
      const updated = await automationApi.upsertColiixTemplate({
        coliixRawState: item.coliixRawState,
        body: draft.body,
        enabled: draft.enabled,
      });
      setItems((list) => list.map((x) => (x.id === item.id ? updated : x)));
      pushToast({ kind: 'success', title: t('automation.templates.saved') });
    } catch {
      pushToast({ kind: 'error', title: t('automation.templates.saveFailed') });
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (item: ColiixStateTemplate) => {
    if (!confirm(t('automation.templates.coliix.deleteConfirm', { state: item.coliixRawState }))) {
      return;
    }
    setSavingId(item.id);
    try {
      await automationApi.deleteColiixTemplate(item.id);
      setItems((list) => list.filter((x) => x.id !== item.id));
      pushToast({ kind: 'success', title: t('automation.templates.coliix.deleted') });
    } catch {
      pushToast({ kind: 'error', title: t('automation.templates.coliix.deleteFailed') });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {t('automation.templates.coliix.title')}
          </h2>
          <p className="text-[11px] text-gray-400">
            {t('automation.templates.coliix.subtitle')}
          </p>
        </div>
      </div>

      {canManage && (
        <GlassCard padding="md" className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-700">
            {t('automation.templates.coliix.createTitle')}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                {t('automation.templates.coliix.pickState')}
              </label>
              <select
                value={newState}
                onChange={(e) => {
                  setNewState(e.target.value);
                  if (e.target.value) setCustomState('');
                }}
                disabled={!canManage || pickable.length === 0}
                className="w-full rounded-btn border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
              >
                <option value="">
                  {pickable.length > 0
                    ? t('automation.templates.coliix.pickStatePlaceholder')
                    : t('automation.templates.coliix.noStatesAvailable')}
                </option>
                {pickable.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                {t('automation.templates.coliix.customState')}
              </label>
              <input
                type="text"
                value={customState}
                onChange={(e) => {
                  setCustomState(e.target.value);
                  if (e.target.value) setNewState('');
                }}
                placeholder={t('automation.templates.coliix.customStatePlaceholder') as string}
                className="w-full rounded-btn border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                maxLength={120}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium text-gray-500">
              {t('automation.templates.variablesHint')}
            </p>
            <VariableChips
              groups={CLIENT_BASE_CHIPS}
              onInsert={(token) =>
                insertAt(newBodyRef.current, newBody, token, setNewBody)
              }
            />
          </div>
          <textarea
            ref={newBodyRef}
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={3}
            placeholder={t('automation.templates.bodyPlaceholder')}
            className="w-full resize-y rounded-btn border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <Toggle checked={newEnabled} onChange={setNewEnabled} />
              {t('automation.templates.coliix.enabledLabel')}
            </label>
            <CRMButton
              size="sm"
              leftIcon={<Plus size={14} />}
              disabled={!canCreate}
              onClick={handleCreate}
            >
              {creating
                ? t('automation.templates.coliix.creating')
                : t('automation.templates.coliix.createCta')}
            </CRMButton>
          </div>
        </GlassCard>
      )}

      {loading ? (
        <div className="skeleton h-32 w-full rounded-card" />
      ) : items.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 bg-gray-50/60 px-3 py-6 text-center text-xs text-gray-400">
          {t('automation.templates.coliix.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {items.map((item) => {
            const draft = drafts[item.id] ?? { body: item.body, enabled: item.enabled };
            const dirty = draft.body !== item.body || draft.enabled !== item.enabled;
            const setDraft = (next: Partial<{ body: string; enabled: boolean }>) =>
              setDrafts((d) => ({ ...d, [item.id]: { ...draft, ...next } }));
            return (
              <GlassCard key={item.id} padding="md" className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{item.coliixRawState}</h3>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      {t('automation.templates.coliix.rowHint')}
                    </p>
                  </div>
                  <Toggle
                    checked={draft.enabled}
                    onChange={(v) => setDraft({ enabled: v })}
                    disabled={!canManage}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-medium text-gray-500">
                    {t('automation.templates.variablesHint')}
                  </p>
                  <VariableChips
                    groups={CLIENT_BASE_CHIPS}
                    onInsert={(token) =>
                      insertAt(editRefs.current[item.id], draft.body, token, (b) =>
                        setDraft({ body: b }),
                      )
                    }
                  />
                </div>
                <textarea
                  ref={(el) => {
                    editRefs.current[item.id] = el;
                  }}
                  value={draft.body}
                  onChange={(e) => setDraft({ body: e.target.value })}
                  disabled={!canManage}
                  rows={4}
                  className="w-full resize-y rounded-btn border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50"
                />
                {canManage && (
                  <div className="flex items-center justify-between gap-2">
                    <CRMButton
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 size={13} />}
                      onClick={() => handleDelete(item)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      {t('automation.templates.coliix.delete')}
                    </CRMButton>
                    <CRMButton
                      size="sm"
                      leftIcon={<Save size={13} />}
                      disabled={!dirty || savingId === item.id}
                      onClick={() => handleSave(item)}
                    >
                      {savingId === item.id
                        ? t('automation.templates.saving')
                        : t('automation.templates.save')}
                    </CRMButton>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </section>
  );
}
