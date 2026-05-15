import { api } from './api';

// ─── Expenses ───────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  fileUrl: string | null;
  // "manual" for typed-in expenses; "facebook" / "tiktok" / "google" for
  // ad-platform integrations (read-only on the UI — auto-managed by the
  // sync worker; deleting them is OK but they re-create on next sync).
  source: string;
  addedById: string | null;
  addedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseListResponse {
  data: Expense[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  totalAmount: number;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  date: string;
  fileUrl?: string | null;
}

// ─── Commission ─────────────────────────────────────────────────────────────

export interface AgentCommissionRow {
  agentId: string;
  name: string;
  email: string;
  roleLabel: string;
  deliveredCount: number;
  paidCount: number;
  pendingCount: number;
  paidTotal: number;
  pendingTotal: number;
  total: number;
  perOrderRate: number;
}

export interface AgentPendingOrder {
  id: string;
  reference: string;
  deliveredAt: string | null;
  commissionAmount: number;
  customer: { fullName: string; city: string };
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other';

export interface CommissionPayment {
  id: string;
  agentId: string;
  amount: number;
  orderIds: string[];
  notes: string | null;
  fileUrl: string | null;
  paidAt: string;
  periodFrom: string | null;
  periodTo: string | null;
  method: PaymentMethod | null;
  agent: { id: string; name: string; email: string };
  recordedBy: { id: string; name: string } | null;
}

export interface RecordPaymentInput {
  agentId: string;
  amount: number;
  orderIds?: string[];
  notes?: string | null;
  fileUrl?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  method?: PaymentMethod | null;
}

// ─── API ────────────────────────────────────────────────────────────────────

export const moneyApi = {
  // Expenses
  listExpenses: (params: {
    page?: number;
    pageSize?: number;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }) => api.get<ExpenseListResponse>('/money/expenses', { params }).then((r) => r.data),

  createExpense: (input: ExpenseInput) =>
    api.post<Expense>('/money/expenses', input).then((r) => r.data),

  updateExpense: (id: string, input: Partial<ExpenseInput>) =>
    api.patch<Expense>(`/money/expenses/${id}`, input).then((r) => r.data),

  deleteExpense: (id: string) =>
    api.delete<void>(`/money/expenses/${id}`).then(() => undefined),

  uploadExpenseFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<{ url: string }>('/money/expenses/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  // Commission
  listAgentCommissions: () =>
    api.get<{ data: AgentCommissionRow[] }>('/money/commission/agents').then((r) => r.data.data),

  listAgentPendingOrders: (agentId: string) =>
    api
      .get<{ data: AgentPendingOrder[] }>(`/money/commission/agents/${agentId}/pending-orders`)
      .then((r) => r.data.data),

  listPaymentHistory: (agentId?: string) =>
    api
      .get<{ data: CommissionPayment[] }>('/money/commission/payments', {
        params: agentId ? { agentId } : undefined,
      })
      .then((r) => r.data.data),

  recordPayment: (input: RecordPaymentInput) =>
    api.post<CommissionPayment>('/money/commission/payments', input).then((r) => r.data),

  deletePayment: (id: string) =>
    api.delete<{ ok: boolean }>(`/money/commission/payments/${id}`).then((r) => r.data),

  uploadCommissionFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<{ url: string }>('/money/commission/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  // Test-data helper: flips N confirmed orders to delivered for the given
  // (or current) agent so the operator can test the commission flow
  // without manually walking through 9 orders. Idempotent server-side.
  seedDelivered: (payload: { agentId?: string; count?: number } = {}) =>
    api
      .post<{
        agent: string;
        perOrderRate: number;
        alreadyPending: number;
        flipped: number;
        references?: string[];
      }>('/money/commission/dev/seed-delivered', payload)
      .then((r) => r.data),
};
