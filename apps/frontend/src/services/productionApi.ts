import { api } from './api';

// ─── Product tests ─────────────────────────────────────────────────────────

export interface TestFabric {
  id: string;
  fabricTypeId: string;
  role: string;
  fabricType?: { id: string; name: string };
}

export interface TestSize {
  id: string;
  size: string;
  tracingMeters: number;
}

export interface TestAccessory {
  id: string;
  materialId: string;
  quantityPerPiece: number;
  material?: { id: string; name: string; unit: string };
}

export interface ProductTest {
  id: string;
  name: string;
  productId: string | null;
  videoUrl?: string | null;
  estimatedCostPerPiece: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  product?: { id: string; name: string } | null;
  fabrics: TestFabric[];
  sizes: TestSize[];
  accessories: TestAccessory[];
}

export interface CreateProductTestPayload {
  name: string;
  productId?: string | null;
  videoUrl?: string | null;
  estimatedCostPerPiece?: number | null;
  notes?: string | null;
  fabrics?: Array<{ fabricTypeId: string; role: string }>;
  sizes?: Array<{ size: string; tracingMeters: number }>;
  accessories?: Array<{ materialId: string; quantityPerPiece: number }>;
}

// ─── Production runs ───────────────────────────────────────────────────────

export type RunStatus = 'draft' | 'active' | 'finished' | 'cancelled';
export type ConsumptionSourceType = 'fabric_roll' | 'accessory';

export interface RunFabric {
  id: string;
  fabricTypeId: string;
  role: string;
  fabricType?: { id: string; name: string };
}

export interface RunSize {
  id: string;
  size: string;
  tracingMeters: number;
  expectedPieces: number;
  actualPieces: number;
  variantId: string | null;
}

export interface RunWorker {
  id: string;
  runId: string;
  employeeId: string;
  role: string | null;
  employee?: { id: string; name: string; role: string };
}

export interface RunConsumption {
  id: string;
  runId: string;
  sourceType: ConsumptionSourceType;
  fabricRollId: string | null;
  materialId: string | null;
  quantity: number;
  unitCost: number;
  createdAt: string;
  fabricRoll?: {
    id: string;
    color: string;
    unitCostPerMeter: number;
    fabricType: { id: string; name: string };
  } | null;
  material?: { id: string; name: string; unit: string } | null;
}

export interface ProductionRun {
  id: string;
  reference: string;
  testId: string | null;
  productId: string | null;
  status: RunStatus;
  startDate: string;
  endDate: string | null;
  expectedPieces: number;
  actualPieces: number;
  materialsCost: number;
  laborCost: number;
  totalCost: number;
  costPerPiece: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  test?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  fabrics: RunFabric[];
  sizes: RunSize[];
  workers: RunWorker[];
  consumptions: RunConsumption[];
}

export interface CreateRunPayload {
  testId?: string | null;
  productId?: string | null;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  fabrics?: Array<{ fabricTypeId: string; role: string }>;
  sizes?: Array<{
    size: string;
    tracingMeters: number;
    expectedPieces: number;
    actualPieces?: number;
    variantId?: string | null;
  }>;
  workerIds?: string[];
}

export interface UpdateRunPayload {
  startDate?: string;
  endDate?: string | null;
  status?: RunStatus;
  notes?: string | null;
  fabrics?: CreateRunPayload['fabrics'];
  sizes?: CreateRunPayload['sizes'];
}

export interface DailyLaborRow {
  date: string;
  employeeId: string;
  employeeName: string;
  dailyRate: number;
  overlapCount: number;
  share: number;
  weight: number;
  contribution: number;
}

export interface CostBreakdown {
  materialsCost: number;
  laborCost: number;
  totalCost: number;
  costPerPiece: number;
  actualPieces: number;
  materials: Array<{
    sourceType: ConsumptionSourceType;
    name: string;
    quantity: number;
    unitCost: number;
    subtotal: number;
  }>;
  laborDaily: DailyLaborRow[];
}

// ─── API surface ───────────────────────────────────────────────────────────

export const productionApi = {
  // Tests
  listTests: () =>
    api.get<{ data: ProductTest[] }>('/atelie/tests/').then((r) => r.data.data),

  getTest: (id: string) => api.get<ProductTest>(`/atelie/tests/${id}`).then((r) => r.data),

  getTestVideo: (id: string) =>
    api
      .get<{ id: string; name: string; videoUrl: string | null }>(`/atelie/tests/${id}/video`)
      .then((r) => r.data),

  createTest: (payload: CreateProductTestPayload) =>
    api.post<ProductTest>('/atelie/tests/', payload).then((r) => r.data),

  updateTest: (id: string, payload: Partial<CreateProductTestPayload>) =>
    api.patch<ProductTest>(`/atelie/tests/${id}`, payload).then((r) => r.data),

  deleteTest: (id: string) => api.delete(`/atelie/tests/${id}`),

  // Runs
  listRuns: (opts: { status?: RunStatus; from?: string; to?: string } = {}) =>
    api
      .get<{ data: ProductionRun[] }>('/atelie/runs/', { params: opts })
      .then((r) => r.data.data),

  getRun: (id: string) => api.get<ProductionRun>(`/atelie/runs/${id}`).then((r) => r.data),

  createRun: (payload: CreateRunPayload) =>
    api.post<ProductionRun>('/atelie/runs/', payload).then((r) => r.data),

  updateRun: (id: string, payload: UpdateRunPayload) =>
    api.patch<ProductionRun>(`/atelie/runs/${id}`, payload).then((r) => r.data),

  consume: (
    id: string,
    payload: {
      sourceType: ConsumptionSourceType;
      fabricRollId?: string;
      materialId?: string;
      quantity: number;
    },
  ) => api.post<ProductionRun>(`/atelie/runs/${id}/consume`, payload).then((r) => r.data),

  addWorker: (id: string, employeeId: string) =>
    api.post<ProductionRun>(`/atelie/runs/${id}/workers/${employeeId}`).then((r) => r.data),

  removeWorker: (id: string, employeeId: string) =>
    api.delete<ProductionRun>(`/atelie/runs/${id}/workers/${employeeId}`).then((r) => r.data),

  finishRun: (id: string) =>
    api.post<ProductionRun>(`/atelie/runs/${id}/finish`).then((r) => r.data),

  costBreakdown: (id: string) =>
    api.get<CostBreakdown>(`/atelie/runs/${id}/cost-breakdown`).then((r) => r.data),
};
