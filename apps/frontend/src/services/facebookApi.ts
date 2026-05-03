import { api } from './api';

export interface AdAccount {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  businessId: string | null;
  isActive: boolean;
  isConnected: boolean;
  hasToken: boolean;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthAuthorizeResponse {
  url: string;
  state: string;
}

// Posted from the popup back to the parent via window.postMessage.
export interface OAuthCallbackResult {
  ok: boolean;
  error?: string;
  accessToken?: string;
  expiresAt?: string | null;
  accounts?: Array<{
    externalId: string;
    name: string;
    currency: string;
    businessId: string | null;
    businessName: string | null;
  }>;
}

export interface ConnectAccountsInput {
  accessToken: string;
  expiresAt: string | null;
  accounts: Array<{ externalId: string; name: string; businessId?: string | null }>;
}

export interface AdCampaign {
  id: string;
  accountId: string;
  externalId: string;
  name: string;
  status: string;
  spendCached: string;
  refreshedAt: string;
}

export interface AdAdset {
  id: string;
  campaignId: string;
  campaignName: string | null;
  externalId: string;
  name: string;
  status: string;
  spendCached: string;
  refreshedAt: string;
}

export interface AdSpendDay {
  id: string;
  accountId: string;
  date: string;
  spend: string;
  currency: string;
  expenseId: string | null;
}

export interface AdInvoice {
  id: string;
  accountId: string;
  externalId: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  currency: string;
  status: string;
  pdfUrl: string | null;
}

export interface SyncResult {
  accountId: string;
  spendDays: number;
  campaigns: number;
  adsets: number;
  invoices: number;
  errors: string[];
}

export const facebookApi = {
  startOAuth: () =>
    api.get<OAuthAuthorizeResponse>('/integrations/facebook/oauth/authorize').then((r) => r.data),

  connectAccounts: (input: ConnectAccountsInput) =>
    api
      .post<{ data: AdAccount[] }>('/integrations/facebook/accounts/connect', input)
      .then((r) => r.data.data),

  listAccounts: () =>
    api.get<{ data: AdAccount[] }>('/integrations/facebook/accounts').then((r) => r.data.data),

  setActive: (id: string, isActive: boolean) =>
    api
      .patch<AdAccount>(`/integrations/facebook/accounts/${id}`, { isActive })
      .then((r) => r.data),

  delete: (id: string) =>
    api.delete<{ ok: true }>(`/integrations/facebook/accounts/${id}`).then((r) => r.data),

  syncNow: (id: string) =>
    api
      .post<SyncResult>(`/integrations/facebook/accounts/${id}/sync`, {})
      .then((r) => r.data),

  campaigns: (id: string) =>
    api
      .get<{ data: AdCampaign[] }>(`/integrations/facebook/accounts/${id}/campaigns`)
      .then((r) => r.data.data),

  adsets: (id: string) =>
    api
      .get<{ data: AdAdset[] }>(`/integrations/facebook/accounts/${id}/adsets`)
      .then((r) => r.data.data),

  spend: (id: string, days = 30) =>
    api
      .get<{ data: AdSpendDay[] }>(`/integrations/facebook/accounts/${id}/spend`, {
        params: { days },
      })
      .then((r) => r.data.data),

  invoices: (id: string) =>
    api
      .get<{ data: AdInvoice[] }>(`/integrations/facebook/accounts/${id}/invoices`)
      .then((r) => r.data.data),
};
