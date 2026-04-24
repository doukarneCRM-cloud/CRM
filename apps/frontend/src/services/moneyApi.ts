import { api } from './api';

// ─── Expenses ───────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  fileUrl: string | null;
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
}

// ─── Delivery Invoice ───────────────────────────────────────────────────────

export interface DeliveryInvoiceOrder {
  id: string;
  reference: string;
  deliveredAt: string | null;
  trackingId: string | null;
  customer: { fullName: string; phone: string; city: string };
  orderTotal: number;   // What the customer paid (order.total)
  shippingFee: number;  // Coliix fee (what they keep)
  netPayout: number;    // orderTotal − shippingFee (what we should receive)
  paidToCarrier: boolean;
  paidToCarrierAt: string | null;
}

export interface DeliveryInvoiceMonth {
  period: string;
  label: string;
  orderCount: number;
  paidCount: number;
  unpaidCount: number;
  totalFees: number;
  paidFees: number;
  unpaidFees: number;
  totalPayout: number;
  paidPayout: number;
  unpaidPayout: number;
  orders: DeliveryInvoiceOrder[];
}

export interface DeliveryInvoicePayload {
  months: DeliveryInvoiceMonth[];
  totals: {
    orders: number;
    paid: number;
    unpaid: number;
    totalFees: number;
    paidFees: number;
    unpaidFees: number;
    totalPayout: number;
    paidPayout: number;
    unpaidPayout: number;
  };
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

  // Delivery invoice
  listDeliveryInvoice: (params: {
    dateFrom?: string;
    dateTo?: string;
    paidOnly?: 'all' | 'paid' | 'unpaid';
    search?: string;
  }) => api.get<DeliveryInvoicePayload>('/money/delivery-invoice', { params }).then((r) => r.data),

  setCarrierPaid: (orderIds: string[], paid: boolean) =>
    api
      .post<{ updated: number }>('/money/delivery-invoice/mark-paid', { orderIds, paid })
      .then((r) => r.data),
};
