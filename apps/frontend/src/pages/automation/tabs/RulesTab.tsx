import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Plus, Save, Trash2, GripVertical, Power } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  automationApi,
  type AutomationRule,
  type AutomationTrigger,
  type Condition,
  type ConditionOp,
  type MessageTemplate,
} from '@/services/automationApi';

const TRIGGER_KEYS: AutomationTrigger[] = [
  'confirmation_confirmed',
  'confirmation_cancelled',
  'confirmation_unreachable',
  'shipping_label_created',
  'shipping_picked_up',
  'shipping_in_transit',
  'shipping_out_for_delivery',
  'shipping_delivered',
  'shipping_returned',
  'shipping_return_validated',
  'commission_paid',
];

function triggerLabel(t: TFunction, trigger: AutomationTrigger): string {
  return t(`automation.triggersLong.${trigger}`);
}

const DEFAULT_FIELDS = [
  'customer.city',
  'customer.tag',
  'order.total',
  'order.itemCount',
  'order.shippingPrice',
  'product.name',
  'agent.id',
];

const OP_KEYS: ConditionOp[] = ['eq', 'neq', 'in', 'not_in', 'gte', 'lte', 'contains'];

function ConditionRow({
  cond,
  fields,
  onChange,
  onRemove,
  disabled,
}: {
  cond: Condition;
  fields: string[];
  onChange: (c: Condition) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const isList = cond.op === 'in' || cond.op === 'not_in';
  const valueStr = Array.isArray(cond.value)
    ? (cond.value as (string | number)[]).join(', ')
    : String(cond.value ?? '');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        disabled={disabled}
        value={cond.field}
        onChange={(e) => onChange({ ...cond, field: e.target.value })}
        className="rounded-btn border border-gray-200 bg-white px-2 py-1.5 text-xs"
      >
        {fields.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <select
        disabled={disabled}
        value={cond.op}
        onChange={(e) => onChange({ ...cond, op: e.target.value as ConditionOp })}
        className="rounded-btn border border-gray-200 bg-white px-2 py-1.5 text-xs"
      >
        {OP_KEYS.map((op) => (
          <option key={op} value={op}>
            {t(`automation.rules.ops.${op}`)}
          </option>
        ))}
      </select>
      <input
        disabled={disabled}
        value={valueStr}
        onChange={(e) => {
          const raw = e.target.value;
          if (isList) {
            const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
            onChange({ ...cond, value: parts });
          } else if (cond.op === 'gte' || cond.op === 'lte') {
            const n = Number(raw);
            onChange({ ...cond, value: Number.isFinite(n) ? n : raw });
          } else {
            onChange({ ...cond, value: raw });
          }
        }}
        placeholder={isList ? t('automation.rules.listPlaceholder') : t('automation.rules.valuePlaceholder')}
        className="min-w-[140px] flex-1 rounded-btn border border-gray-200 bg-white px-2 py-1.5 text-xs"
      />
      <button
        disabled={disabled}
        onClick={onRemove}
        className="rounded-btn p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
        title={t('automation.rules.removeCondition')}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function RuleEditor({
  rule,
  templates,
  fields,
  onSave,
  onDelete,
  canManage,
}: {
  rule: AutomationRule;
  templates: MessageTemplate[];
  fields: string[];
  onSave: (patch: Partial<AutomationRule>) => Promise<void>;
  onDelete: () => Promise<void>;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(rule);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocal(rule);
  }, [rule]);

  const allConds: Condition[] = local.conditions.all ?? [];
  const anyConds: Condition[] = local.conditions.any ?? [];

  function updateConds(key: 'all' | 'any', next: Condition[]) {
    setLocal((r) => ({ ...r, conditions: { ...r.conditions, [key]: next } }));
  }

  async function save() {
    setBusy(true);
    try {
      await onSave({
        name: local.name,
        priority: local.priority,
        enabled: local.enabled,
        overlap: local.overlap,
        conditions: local.conditions,
        templateId: local.templateId,
        sendFromSystem: local.sendFromSystem,
      });
    } finally {
      setBusy(false);
    }
  }

  const template = templates.find((tpl) => tpl.id === local.templateId);

  return (
    <div className="rounded-card border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <GripVertical size={14} className="text-gray-300" />
        <input
          disabled={!canManage}
          value={local.name}
          onChange={(e) => setLocal({ ...local, name: e.target.value })}
          className="flex-1 rounded-btn border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-primary focus:border-gray-200 focus:bg-white"
        />
        <div className="flex items-center gap-1 text-[11px] text-gray-500">
          {t('automation.rules.priority')}
          <input
            disabled={!canManage}
            type="number"
            value={local.priority}
            onChange={(e) => setLocal({ ...local, priority: Number(e.target.value) || 0 })}
            className="w-14 rounded-btn border border-gray-200 px-1.5 py-1 text-xs"
          />
        </div>
        <button
          disabled={!canManage}
          onClick={() => setLocal({ ...local, enabled: !local.enabled })}
          className={`flex items-center gap-1 rounded-btn px-2 py-1 text-[11px] font-semibold ${local.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
        >
          <Power size={11} /> {local.enabled ? t('automation.rules.enabled') : t('automation.rules.disabled')}
        </button>
        <button
          disabled={!canManage || busy}
          onClick={onDelete}
          className="rounded-btn p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
          title={t('automation.rules.deleteRule')}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase text-gray-500">
            {t('automation.rules.template')}
          </label>
          <select
            disabled={!canManage}
            value={local.templateId}
            onChange={(e) => setLocal({ ...local, templateId: e.target.value })}
            className="w-full rounded-btn border border-gray-200 bg-white px-2 py-1.5 text-xs"
          >
            {templates
              .filter((tpl) => tpl.trigger === local.trigger)
              .map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label} {tpl.enabled ? '' : t('automation.rules.templateDisabled')}
                </option>
              ))}
          </select>
          {template && (
            <p className="mt-1 rounded-btn bg-gray-50 p-2 text-[11px] text-gray-600">
              {template.body}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase text-gray-500">
            {t('automation.rules.whenMultipleMatch')}
          </label>
          <select
            disabled={!canManage}
            value={local.overlap}
            onChange={(e) => setLocal({ ...local, overlap: e.target.value })}
            className="w-full rounded-btn border border-gray-200 bg-white px-2 py-1.5 text-xs"
          >
            <option value="first">{t('automation.rules.overlap.first')}</option>
            <option value="all">{t('automation.rules.overlap.all')}</option>
          </select>
          <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
            <input
              disabled={!canManage}
              type="checkbox"
              checked={local.sendFromSystem}
              onChange={(e) => setLocal({ ...local, sendFromSystem: e.target.checked })}
            />
            {t('automation.rules.forceSystem')}
          </label>
        </div>
      </div>

      <div className="mt-3 rounded-card border border-gray-100 bg-gray-50/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase text-gray-500">
            {t('automation.rules.allOf')}
          </p>
          <button
            disabled={!canManage}
            onClick={() =>
              updateConds('all', [...allConds, { field: fields[0] ?? 'customer.city', op: 'eq', value: '' }])
            }
            className="flex items-center gap-1 rounded-btn bg-white px-2 py-1 text-[11px] text-primary shadow-sm"
          >
            <Plus size={11} /> {t('automation.rules.add')}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {allConds.length === 0 && (
            <p className="text-[11px] italic text-gray-400">{t('automation.rules.noAnd')}</p>
          )}
          {allConds.map((c, i) => (
            <ConditionRow
              key={i}
              cond={c}
              fields={fields}
              disabled={!canManage}
              onChange={(next) => {
                const copy = [...allConds];
                copy[i] = next;
                updateConds('all', copy);
              }}
              onRemove={() => updateConds('all', allConds.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 rounded-card border border-gray-100 bg-gray-50/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase text-gray-500">
            {t('automation.rules.anyOf')}
          </p>
          <button
            disabled={!canManage}
            onClick={() =>
              updateConds('any', [...anyConds, { field: fields[0] ?? 'customer.city', op: 'eq', value: '' }])
            }
            className="flex items-center gap-1 rounded-btn bg-white px-2 py-1 text-[11px] text-primary shadow-sm"
          >
            <Plus size={11} /> {t('automation.rules.add')}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {anyConds.length === 0 && (
            <p className="text-[11px] italic text-gray-400">{t('automation.rules.noOr')}</p>
          )}
          {anyConds.map((c, i) => (
            <ConditionRow
              key={i}
              cond={c}
              fields={fields}
              disabled={!canManage}
              onChange={(next) => {
                const copy = [...anyConds];
                copy[i] = next;
                updateConds('any', copy);
              }}
              onRemove={() => updateConds('any', anyConds.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      </div>

      {canManage && (
        <div className="mt-3 flex justify-end">
          <CRMButton size="sm" onClick={save} disabled={busy}>
            <Save size={12} /> {t('automation.rules.saveRule')}
          </CRMButton>
        </div>
      )}
    </div>
  );
}

export function RulesTab() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.AUTOMATION_MANAGE);
  const pushToast = useToastStore((s) => s.push);

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [fields, setFields] = useState<string[]>(DEFAULT_FIELDS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, tpls] = await Promise.all([
        automationApi.listRules(),
        automationApi.listTemplates(),
      ]);
      setRules(r.data);
      setFields(r.allowedFields ?? DEFAULT_FIELDS);
      setTemplates(tpls);
    } catch (err) {
      pushToast({ kind: 'error', title: t('automation.rules.loadFailed') });
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const rulesByTrigger = useMemo(() => {
    const map = new Map<AutomationTrigger, AutomationRule[]>();
    for (const r of rules) {
      const list = map.get(r.trigger) ?? [];
      list.push(r);
      map.set(r.trigger, list);
    }
    return map;
  }, [rules]);

  async function addRule(trigger: AutomationTrigger) {
    const template = templates.find((tpl) => tpl.trigger === trigger);
    if (!template) {
      pushToast({ kind: 'error', title: t('automation.rules.noTemplateForTrigger') });
      return;
    }
    try {
      await automationApi.createRule({
        trigger,
        name: t('automation.rules.newRuleName'),
        templateId: template.id,
        priority: 10,
        enabled: true,
        conditions: {},
      });
      await load();
    } catch (err) {
      pushToast({ kind: 'error', title: t('automation.rules.createFailed') });
      console.error(err);
    }
  }

  async function save(rule: AutomationRule, patch: Partial<AutomationRule>) {
    try {
      await automationApi.updateRule(rule.id, patch);
      await load();
      pushToast({ kind: 'success', title: t('automation.rules.saved') });
    } catch (err) {
      pushToast({ kind: 'error', title: t('automation.rules.saveFailed') });
      console.error(err);
    }
  }

  async function del(rule: AutomationRule) {
    if (!confirm(t('automation.rules.confirmDelete', { name: rule.name }))) return;
    try {
      await automationApi.deleteRule(rule.id);
      await load();
    } catch (err) {
      pushToast({ kind: 'error', title: t('automation.rules.deleteFailed') });
      console.error(err);
    }
  }

  if (loading) {
    return (
      <GlassCard>
        <p className="p-4 text-sm text-gray-500">{t('automation.rules.loading')}</p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <GlassCard>
        <div className="p-4">
          <p className="text-sm text-gray-600">
            <Trans i18nKey="automation.rules.intro" components={{ 1: <strong /> }} />
          </p>
        </div>
      </GlassCard>

      {TRIGGER_KEYS.map((trigger) => {
        const list = rulesByTrigger.get(trigger) ?? [];
        return (
          <GlassCard key={trigger}>
            <div className="flex items-center justify-between border-b border-gray-100 p-3">
              <p className="text-sm font-semibold text-primary">{triggerLabel(t, trigger)}</p>
              {canManage && (
                <button
                  onClick={() => addRule(trigger)}
                  className="flex items-center gap-1 rounded-btn bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white"
                >
                  <Plus size={11} /> {t('automation.rules.newRule')}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 p-3">
              {list.length === 0 && (
                <p className="text-[11px] italic text-gray-400">{t('automation.rules.noRules')}</p>
              )}
              {list.map((r) => (
                <RuleEditor
                  key={r.id}
                  rule={r}
                  templates={templates}
                  fields={fields}
                  canManage={canManage}
                  onSave={(patch) => save(r, patch)}
                  onDelete={() => del(r)}
                />
              ))}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
