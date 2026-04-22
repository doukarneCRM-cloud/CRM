import { api } from './api';

export type AutomationTrigger =
  | 'confirmation_confirmed'
  | 'confirmation_cancelled'
  | 'confirmation_unreachable'
  | 'shipping_label_created'
  | 'shipping_picked_up'
  | 'shipping_in_transit'
  | 'shipping_out_for_delivery'
  | 'shipping_delivered'
  | 'shipping_returned'
  | 'shipping_return_validated'
  | 'commission_paid';

export type MessageLogStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'dead';

export type ConditionOp = 'eq' | 'neq' | 'in' | 'not_in' | 'gte' | 'lte' | 'contains';

export interface Condition {
  field: string;
  op: ConditionOp;
  value: string | number | string[] | number[];
}

export interface RuleConditions {
  all?: Condition[];
  any?: Condition[];
}

export interface AutomationRule {
  id: string;
  trigger: AutomationTrigger;
  name: string;
  priority: number;
  enabled: boolean;
  overlap: 'first' | 'all' | string;
  conditions: RuleConditions;
  templateId: string;
  sendFromSystem: boolean;
  createdAt: string;
  updatedAt: string;
  template?: { id: string; body: string; enabled: boolean };
}

export interface MessageTemplate {
  id: string;
  trigger: AutomationTrigger;
  label: string;
  enabled: boolean;
  body: string;
  updatedAt: string;
}

export interface MessageLogRow {
  id: string;
  trigger: AutomationTrigger;
  orderId: string | null;
  agentId: string | null;
  recipientPhone: string;
  body: string;
  status: MessageLogStatus;
  providerId: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  order?: { reference: string } | null;
  agent?: { name: string } | null;
}

export interface LogsQuery {
  trigger?: AutomationTrigger;
  status?: MessageLogStatus;
  from?: string;
  to?: string;
  orderId?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}

export const automationApi = {
  listTemplates: () =>
    api.get<{ data: MessageTemplate[] }>('/automation/templates').then((r) => r.data.data),
  updateTemplate: (trigger: AutomationTrigger, patch: { enabled?: boolean; body?: string }) =>
    api.patch<MessageTemplate>(`/automation/templates/${trigger}`, patch).then((r) => r.data),
  listLogs: (query: LogsQuery = {}) =>
    api
      .get<{ rows: MessageLogRow[]; total: number }>('/automation/logs', { params: query })
      .then((r) => r.data),
  retryLog: (id: string) =>
    api.post<{ ok: true }>(`/automation/logs/${id}/retry`).then((r) => r.data),
  getSystemSession: () =>
    api.get<{ sessionId: string | null }>('/automation/system-session').then((r) => r.data),
  setSystemSession: (sessionId: string | null) =>
    api.post<{ ok: true }>('/automation/system-session', { sessionId }).then((r) => r.data),

  listRules: (trigger?: AutomationTrigger) =>
    api
      .get<{ data: AutomationRule[]; allowedFields: string[] }>('/automation/rules', {
        params: trigger ? { trigger } : {},
      })
      .then((r) => r.data),
  createRule: (payload: Partial<AutomationRule> & { trigger: AutomationTrigger; name: string; templateId: string }) =>
    api.post<AutomationRule>('/automation/rules', payload).then((r) => r.data),
  updateRule: (id: string, patch: Partial<AutomationRule>) =>
    api.patch<AutomationRule>(`/automation/rules/${id}`, patch).then((r) => r.data),
  deleteRule: (id: string) =>
    api.delete<{ ok: true }>(`/automation/rules/${id}`).then((r) => r.data),
};
