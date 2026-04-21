import { api } from './api';

// ─── Employees ──────────────────────────────────────────────────────────────

export interface AtelieEmployee {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  baseSalary: number;
  workingDays: number;
  isActive: boolean;
  createdAt: string;
  currentWeek?: {
    weekStart: string;
    daysMask: number;
    halfDaysMask: number;
    daysWorked: number;
    amount: number;
    isPaid: boolean;
    salaryId: string | null;
  } | null;
}

export interface CreateEmployeePayload {
  name: string;
  phone?: string | null;
  role: string;
  baseSalary: number;
  workingDays?: number;
}

export interface UpdateEmployeePayload extends Partial<CreateEmployeePayload> {
  isActive?: boolean;
}

export interface EmployeeKpis {
  totalWeeks: number;
  totalDaysPresent: number;
  avgDaysPerWeek: number;
  attendanceRate: number;
  totalEarned: number;
  totalPaid: number;
  outstanding: number;
  longestStreak: number;
  weekly: Array<{
    weekStart: string;
    daysWorked: number;
    amount: number;
    isPaid: boolean;
  }>;
}

// ─── Attendance ─────────────────────────────────────────────────────────────

export type DayState = 'absent' | 'half' | 'full';

export interface AttendanceRow {
  employeeId: string;
  employeeName: string;
  role: string;
  baseSalary: number;
  workingDays: number;
  daysMask: number;
  halfDaysMask: number;
  daysWorked: number;
  amount: number;
  isPaid: boolean;
  salaryId: string | null;
}

// ─── Salary ─────────────────────────────────────────────────────────────────

export interface SalaryRow {
  id: string;
  weekStart: string;
  amount: number;
  paidAmount: number;
  isPaid: boolean;
  paidAt: string | null;
  notes: string | null;
  employee: { id: string; name: string; role: string };
  paidBy: { id: string; name: string } | null;
}

// ─── Materials ──────────────────────────────────────────────────────────────

export type MaterialCategory = 'fabric' | 'accessory' | 'needle' | 'thread' | 'other';
export type MaterialUnit = 'meter' | 'piece' | 'kilogram' | 'spool' | 'box';
export type MovementType = 'in' | 'out' | 'adjustment';

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: MaterialUnit;
  stock: number;
  lowStockThreshold: number;
  unitCost: number | null;
  supplier: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialMovement {
  id: string;
  materialId: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  userId: string | null;
  createdAt: string;
}

export interface CreateMaterialPayload {
  name: string;
  category: MaterialCategory;
  unit: MaterialUnit;
  stock?: number;
  lowStockThreshold?: number;
  unitCost?: number | null;
  supplier?: string | null;
  notes?: string | null;
}

// ─── Fabric types & rolls ──────────────────────────────────────────────────

export interface FabricType {
  id: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface FabricRoll {
  id: string;
  fabricTypeId: string;
  color: string;
  widthCm: number | null;
  initialLength: number;
  remainingLength: number;
  unitCostPerMeter: number;
  purchaseDate: string;
  supplier: string | null;
  reference: string | null;
  notes: string | null;
  isDepleted: boolean;
  expenseId: string | null;
  createdAt: string;
  fabricType?: FabricType;
}

export interface FabricColorGroup {
  color: string;
  totalRemaining: number;
  rolls: Array<Omit<FabricRoll, 'fabricTypeId' | 'color' | 'createdAt'>>;
}

export interface FabricTypeGroup {
  typeId: string;
  typeName: string;
  totalRemaining: number;
  colors: FabricColorGroup[];
}

export interface CreateFabricTypePayload {
  name: string;
  notes?: string | null;
  isActive?: boolean;
}

export interface CreateFabricRollPayload {
  fabricTypeId: string;
  color: string;
  widthCm?: number | null;
  initialLength: number;
  unitCostPerMeter: number;
  purchaseDate: string;
  supplier?: string | null;
  reference?: string | null;
  notes?: string | null;
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export type TaskStatus = 'backlog' | 'processing' | 'done' | 'forgotten' | 'incomplete';
export type TaskVisibility = 'private' | 'shared';

export interface Task {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  visibility: TaskVisibility;
  color: string | null;
  position: number;
  incompleteReason: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name: string };
  _count?: { comments: number; attachments: number };
}

export interface TaskDetail extends Task {
  owner: { id: string; name: string };
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string };
  }>;
  attachments: Array<{
    id: string;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  }>;
}

export interface CreateTaskPayload {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  visibility?: TaskVisibility;
  color?: string | null;
  dueAt?: string | null;
}

// ─── API surface ────────────────────────────────────────────────────────────

export const atelieApi = {
  // Employees
  listEmployees: (activeOnly = true) =>
    api
      .get<{ data: AtelieEmployee[] }>('/atelie/employees', { params: { activeOnly } })
      .then((r) => r.data.data),

  createEmployee: (payload: CreateEmployeePayload) =>
    api.post<AtelieEmployee>('/atelie/employees', payload).then((r) => r.data),

  updateEmployee: (id: string, payload: UpdateEmployeePayload) =>
    api.patch<AtelieEmployee>(`/atelie/employees/${id}`, payload).then((r) => r.data),

  deactivateEmployee: (id: string) => api.delete(`/atelie/employees/${id}`),

  getEmployeeKpis: (id: string) =>
    api.get<EmployeeKpis>(`/atelie/employees/${id}/kpis`).then((r) => r.data),

  // Attendance
  getWeeklyGrid: (weekStart?: string) =>
    api
      .get<{ weekStart: string; data: AttendanceRow[] }>('/atelie/attendance', {
        params: weekStart ? { weekStart } : {},
      })
      .then((r) => r.data),

  toggleAttendanceDay: (payload: {
    employeeId: string;
    weekStart: string;
    dayIndex: number;
    state: DayState;
  }) => api.post('/atelie/attendance/toggle', payload).then((r) => r.data),

  // Salary
  listWeekSalaries: (weekStart?: string) =>
    api
      .get<{ weekStart: string; data: SalaryRow[] }>('/atelie/salary', {
        params: weekStart ? { weekStart } : {},
      })
      .then((r) => r.data),

  paySalary: (id: string, payload: { paidAmount?: number; notes?: string }) =>
    api.post<SalaryRow>(`/atelie/salary/${id}/pay`, payload).then((r) => r.data),

  unpaySalary: (id: string) =>
    api.post<SalaryRow>(`/atelie/salary/${id}/unpay`).then((r) => r.data),

  getEmployeeSalaryHistory: (employeeId: string, limit = 12) =>
    api
      .get<{ data: SalaryRow[] }>(`/atelie/salary/history/${employeeId}`, {
        params: { limit },
      })
      .then((r) => r.data.data),

  // Materials
  listMaterials: (opts: { category?: MaterialCategory; lowOnly?: boolean; includeInactive?: boolean } = {}) =>
    api
      .get<{ data: Material[] }>('/atelie/materials/', { params: opts })
      .then((r) => r.data.data),

  createMaterial: (payload: CreateMaterialPayload) =>
    api.post<Material>('/atelie/materials/', payload).then((r) => r.data),

  updateMaterial: (id: string, payload: Partial<CreateMaterialPayload> & { isActive?: boolean }) =>
    api.patch<Material>(`/atelie/materials/${id}`, payload).then((r) => r.data),

  deactivateMaterial: (id: string) => api.delete(`/atelie/materials/${id}`),

  recordMovement: (id: string, payload: { type: MovementType; quantity: number; reason?: string }) =>
    api
      .post<{ movement: MaterialMovement; material: Material }>(
        `/atelie/materials/${id}/movement`,
        payload,
      )
      .then((r) => r.data),

  listMovements: (id: string, limit = 50) =>
    api
      .get<{ data: MaterialMovement[] }>(`/atelie/materials/${id}/movements`, { params: { limit } })
      .then((r) => r.data.data),

  // Fabric types
  listFabricTypes: (includeInactive = false) =>
    api
      .get<{ data: FabricType[] }>('/atelie/fabric/types', { params: { includeInactive } })
      .then((r) => r.data.data),

  createFabricType: (payload: CreateFabricTypePayload) =>
    api.post<FabricType>('/atelie/fabric/types', payload).then((r) => r.data),

  updateFabricType: (id: string, payload: Partial<CreateFabricTypePayload>) =>
    api.patch<FabricType>(`/atelie/fabric/types/${id}`, payload).then((r) => r.data),

  deactivateFabricType: (id: string) => api.delete(`/atelie/fabric/types/${id}`),

  // Fabric rolls
  fabricRollsTree: () =>
    api.get<{ data: FabricTypeGroup[] }>('/atelie/fabric/rolls/tree').then((r) => r.data.data),

  listFabricRolls: (opts: { fabricTypeId?: string; color?: string; depleted?: boolean } = {}) =>
    api
      .get<{ data: FabricRoll[] }>('/atelie/fabric/rolls', { params: opts })
      .then((r) => r.data.data),

  createFabricRoll: (payload: CreateFabricRollPayload) =>
    api.post<{ roll: FabricRoll; expense: unknown }>('/atelie/fabric/rolls', payload).then((r) => r.data),

  updateFabricRoll: (id: string, payload: Partial<CreateFabricRollPayload>) =>
    api.patch<FabricRoll>(`/atelie/fabric/rolls/${id}`, payload).then((r) => r.data),

  adjustFabricRoll: (id: string, payload: { remainingLength: number; reason?: string }) =>
    api.post<FabricRoll>(`/atelie/fabric/rolls/${id}/adjust`, payload).then((r) => r.data),

  deleteFabricRoll: (id: string) => api.delete(`/atelie/fabric/rolls/${id}`),

  // Tasks
  listTasks: () =>
    api
      .get<{ mine: Task[]; shared: Task[] }>('/atelie/tasks/')
      .then((r) => r.data),

  getTask: (id: string) =>
    api.get<TaskDetail>(`/atelie/tasks/${id}`).then((r) => r.data),

  createTask: (payload: CreateTaskPayload) =>
    api.post<Task>('/atelie/tasks/', payload).then((r) => r.data),

  updateTask: (id: string, payload: Partial<CreateTaskPayload>) =>
    api.patch<Task>(`/atelie/tasks/${id}`, payload).then((r) => r.data),

  moveTask: (id: string, payload: { status: TaskStatus; position: number; incompleteReason?: string }) =>
    api.patch<Task>(`/atelie/tasks/${id}/move`, payload).then((r) => r.data),

  deleteTask: (id: string) => api.delete(`/atelie/tasks/${id}`),

  addComment: (id: string, body: string) =>
    api
      .post<{
        id: string;
        body: string;
        createdAt: string;
        author: { id: string; name: string };
      }>(`/atelie/tasks/${id}/comments`, { body })
      .then((r) => r.data),

  deleteComment: (id: string, cid: string) =>
    api.delete(`/atelie/tasks/${id}/comments/${cid}`),

  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`/atelie/tasks/${id}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  deleteAttachment: (id: string, aid: string) =>
    api.delete(`/atelie/tasks/${id}/attachments/${aid}`),

  hideTask: (id: string) => api.post(`/atelie/tasks/${id}/hide`).then((r) => r.data),

  unhideTask: (id: string) => api.delete(`/atelie/tasks/${id}/hide`).then((r) => r.data),
};
