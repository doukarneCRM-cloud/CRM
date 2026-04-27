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
  unitCostSnapshot?: number | null;
  material?: { id: string; name: string; unit: string };
}

export type SampleStatus = 'draft' | 'tested' | 'approved' | 'archived';

export interface SamplePhoto {
  id: string;
  testId: string;
  url: string;
  caption?: string | null;
  position: number;
  createdAt: string;
}

export interface ProductTest {
  id: string;
  name: string;
  productId: string | null;
  videoUrl?: string | null;
  description: string | null;
  status: SampleStatus;
  approvedAt: string | null;
  approvedById: string | null;
  approvedBy?: { id: string; name: string } | null;
  laborMadPerPiece: number | null;
  confirmationFee: number | null;
  deliveryFee: number | null;
  markupPercent: number | null;
  suggestedPrice: number | null;
  estimatedCostPerPiece: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  product?: { id: string; name: string } | null;
  fabrics: TestFabric[];
  sizes: TestSize[];
  accessories: TestAccessory[];
  photos: SamplePhoto[];
}

export interface CreateProductTestPayload {
  name: string;
  productId?: string | null;
  videoUrl?: string | null;
  description?: string | null;
  notes?: string | null;
  laborMadPerPiece?: number | null;
  confirmationFee?: number | null;
  deliveryFee?: number | null;
  markupPercent?: number | null;
  estimatedCostPerPiece?: number | null;
  suggestedPrice?: number | null;
  fabrics?: Array<{ fabricTypeId: string; role: string }>;
  sizes?: Array<{ size: string; tracingMeters: number }>;
  accessories?: Array<{
    materialId: string;
    quantityPerPiece: number;
    unitCostSnapshot?: number | null;
  }>;
}

export interface SampleCostBreakdown {
  fabric: number;
  accessories: number;
  labor: number;
  fees: number;
  total: number;
  suggestedPrice: number | null;
  fabricDetail: Array<{
    fabricTypeId: string;
    fabricTypeName: string;
    avgMetersPerPiece: number;
    avgMadPerMeter: number;
    contribution: number;
  }>;
  accessoryDetail: Array<{
    materialId: string;
    materialName: string;
    quantityPerPiece: number;
    unitCost: number;
    contribution: number;
  }>;
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

export type ProductionStageKey = 'cut' | 'sew' | 'finish' | 'qc' | 'packed';
export type LaborAllocationMode = 'by_pieces' | 'by_complexity' | 'manual';
export type ProductionLogTypeKey =
  | 'system'
  | 'stage'
  | 'consumption'
  | 'labor'
  | 'note'
  | 'status';

export interface RunStage {
  id: string;
  runId: string;
  stage: ProductionStageKey;
  startedAt: string | null;
  completedAt: string | null;
  inputPieces: number;
  outputPieces: number;
  rejectedPieces: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunLog {
  id: string;
  runId: string;
  type: ProductionLogTypeKey;
  action: string;
  performedBy: string | null;
  performedById: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface ProductionWeekSummary {
  id: string;
  weekStart: string;
  closed: boolean;
  closedAt: string | null;
  laborTotal: number;
  runCount: number;
  totalPieces: number;
}

export interface ProductionWeekProjection {
  weekId: string;
  weekStart: string;
  closed: boolean;
  closedAt: string | null;
  laborTotal: number;
  manualValid: boolean;
  manualSum: number;
  runs: Array<{
    runId: string;
    reference: string;
    status: RunStatus;
    sampleName: string | null;
    actualPieces: number;
    expectedPieces: number;
    mode: LaborAllocationMode;
    share: number;
    currentLaborCost: number;
  }>;
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
  weekId: string | null;
  laborAllocation: LaborAllocationMode;
  laborManualShare: number | null;
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
  listTests: (status?: SampleStatus | SampleStatus[]) => {
    const params = status
      ? { status: Array.isArray(status) ? status.join(',') : status }
      : undefined;
    return api
      .get<{ data: ProductTest[] }>('/atelie/tests', { params })
      .then((r) => r.data.data);
  },

  getTest: (id: string) =>
    api.get<ProductTest>(`/atelie/tests/${id}`).then((r) => r.data),

  getCost: (id: string) =>
    api.get<SampleCostBreakdown>(`/atelie/tests/${id}/cost`).then((r) => r.data),

  transitionSample: (id: string, to: SampleStatus) =>
    api.post<ProductTest>(`/atelie/tests/${id}/transition`, { to }).then((r) => r.data),

  replacePhotos: (
    id: string,
    photos: Array<{ url: string; caption?: string | null; position?: number }>,
  ) =>
    api
      .put<{ data: SamplePhoto[] }>(`/atelie/tests/${id}/photos`, { photos })
      .then((r) => r.data.data),

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

  // ── Stages ────────────────────────────────────────────────────────────
  listStages: (id: string) =>
    api
      .get<{ data: RunStage[]; order: ProductionStageKey[] }>(`/atelie/runs/${id}/stages`)
      .then((r) => r.data),

  advanceStage: (
    id: string,
    stage: ProductionStageKey,
    payload: {
      inputPieces?: number;
      outputPieces?: number;
      rejectedPieces?: number;
      notes?: string | null;
      complete?: boolean;
    },
  ) =>
    api
      .patch<{ data: RunStage[] }>(`/atelie/runs/${id}/stages/${stage}`, payload)
      .then((r) => r.data.data),

  // ── Logs ──────────────────────────────────────────────────────────────
  listLogs: (id: string, opts: { page?: number; pageSize?: number } = {}) =>
    api
      .get<{
        data: RunLog[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>(`/atelie/runs/${id}/logs`, { params: opts })
      .then((r) => r.data),

  // ── Labor allocation mode ─────────────────────────────────────────────
  setLaborAllocation: (
    id: string,
    payload: { laborAllocation: LaborAllocationMode; laborManualShare?: number | null },
  ) =>
    api
      .patch<ProductionRun>(`/atelie/runs/${id}/labor-allocation`, payload)
      .then((r) => r.data),

  // ── Weeks ─────────────────────────────────────────────────────────────
  listWeeks: () =>
    api
      .get<{ data: ProductionWeekSummary[] }>('/atelie/weeks/')
      .then((r) => r.data.data),

  getWeek: (weekStart: string) =>
    api
      .get<ProductionWeekProjection>(`/atelie/weeks/${weekStart}`)
      .then((r) => r.data),

  closeWeek: (weekStart: string) =>
    api
      .post<ProductionWeekProjection>(`/atelie/weeks/${weekStart}/close`)
      .then((r) => r.data),
};
