import { api } from './api';

// ─── User / Agent types ─────────────────────────────────────────────────────

export interface TeamRole {
  id: string;
  name: string;
  label: string;
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  role: TeamRole;
  stats: {
    totalOrders: number;
    confirmed: number;
    delivered: number;
    confirmationRate: number;
    deliveryRate: number;
    todayAssigned: number;
  };
  commission: { earned: number; paid: number; unpaid: number };
  performance7d: { date: string; orders: number }[];
}

export interface CreateUserPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
  roleId: string;
  avatarUrl?: string | null;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  phone?: string | null;
  password?: string;
  roleId?: string;
  avatarUrl?: string | null;
  isActive?: boolean;
}

// ─── Role types ──────────────────────────────────────────────────────────────

export interface RoleDetail {
  id: string;
  name: string;
  label: string;
  permissionKeys: string[];
  userCount: number;
  isSystem: boolean;
}

export interface PermissionOption {
  key: string;
  label: string;
}

// ─── Commission + assignment types ──────────────────────────────────────────

export interface CommissionRule {
  agentId: string;
  onConfirm: number;
  onDeliver: number;
}

export interface AssignmentRuleState {
  isActive: boolean;
  strategy: 'round_robin' | 'by_product';
  bounceCount: number;
  // User ids opted into the rotation. Empty array = "everyone holding the
  // confirmation:view permission" (back-compat). Send the full desired
  // list on every patch — backend overwrites, doesn't merge.
  eligibleAgentIds: string[];
}

export interface AssignmentCandidate {
  id: string;
  name: string;
  isActive: boolean;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const teamApi = {
  listUsers: (params?: { search?: string; roleId?: string; isActive?: boolean }) =>
    api.get<{ data: TeamUser[] }>('/users', { params }).then((r) => r.data.data),

  createUser: (payload: CreateUserPayload) =>
    api.post<TeamUser>('/users', payload).then((r) => r.data),

  updateUser: (id: string, payload: UpdateUserPayload) =>
    api.patch<TeamUser>(`/users/${id}`, payload).then((r) => r.data),

  listRoles: () =>
    api.get<{ data: RoleDetail[] }>('/roles').then((r) => r.data.data),

  listPermissions: () =>
    api.get<{ data: PermissionOption[] }>('/permissions').then((r) => r.data.data),

  createRole: (payload: { name: string; label: string; permissionKeys: string[] }) =>
    api.post<RoleDetail>('/roles', payload).then((r) => r.data),

  updateRole: (id: string, payload: { label?: string; permissionKeys?: string[] }) =>
    api.patch<RoleDetail>(`/roles/${id}`, payload).then((r) => r.data),

  listCommission: () =>
    api.get<{ data: CommissionRule[] }>('/commission-rules').then((r) => r.data.data),

  upsertCommission: (agentId: string, payload: { onConfirm: number; onDeliver: number }) =>
    api.put<CommissionRule>(`/commission-rules/${agentId}`, payload).then((r) => r.data),

  payoutCommission: (agentId: string) =>
    api
      .post<{ count: number; amount: number }>(`/commission-rules/${agentId}/payout`)
      .then((r) => r.data),

  getAssignmentRule: () =>
    api.get<AssignmentRuleState>('/assignment-rules').then((r) => r.data),

  updateAssignmentRule: (payload: Partial<AssignmentRuleState>) =>
    api.patch<AssignmentRuleState>('/assignment-rules', payload).then((r) => r.data),

  simulateAssignment: (count: number) =>
    api
      .get<{ count: number; sequence: string[] }>('/assignment-rules/simulate', { params: { count } })
      .then((r) => r.data),

  listAssignmentCandidates: () =>
    api
      .get<{ data: AssignmentCandidate[] }>('/assignment-rules/candidates')
      .then((r) => r.data.data),
};
