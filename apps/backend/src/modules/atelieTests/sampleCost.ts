/**
 * Sample (Échantillon) cost calculator.
 *
 * Computes the per-piece estimated cost for a ProductTest by combining:
 *   - fabric cost: avg(per-size tracingMeters) × avg fabric MAD/m for the
 *     listed fabric types (averaged across active rolls; falls back to 0
 *     when no rolls exist for the type yet)
 *   - accessory cost: Σ qtyPerPiece × unitCostSnapshot (or live unitCost
 *     when snapshot is null — covers legacy rows pre-migration)
 *   - labor MAD per piece (admin-entered)
 *   - confirmation fee + delivery fee (admin-entered, per-piece)
 *
 * `suggestedPrice` = totalCostPerPiece × (1 + markupPercent/100).
 *
 * The breakdown object is returned alongside the final number so the UI
 * can show a transparent "where the number comes from" panel.
 */

import { prisma } from '../../shared/prisma';

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

interface ComputeInput {
  testId: string;
}

export async function computeSampleCost({ testId }: ComputeInput): Promise<SampleCostBreakdown> {
  const test = await prisma.productTest.findUnique({
    where: { id: testId },
    include: {
      fabrics: { include: { fabricType: { include: { rolls: true } } } },
      sizes: true,
      accessories: { include: { material: true } },
    },
  });

  if (!test) {
    throw { statusCode: 404, code: 'NOT_FOUND', message: 'Sample not found' };
  }

  // ── Fabric cost ──────────────────────────────────────────────────────────
  // Use the average tracing-meters across the configured sizes so the
  // estimate reflects a "typical" piece rather than the smallest/largest.
  const sizeMeters = test.sizes.map((s) => s.tracingMeters);
  const avgMetersPerPiece = sizeMeters.length
    ? sizeMeters.reduce((a, b) => a + b, 0) / sizeMeters.length
    : 0;

  let fabricCost = 0;
  const fabricDetail: SampleCostBreakdown['fabricDetail'] = [];
  for (const f of test.fabrics) {
    // Average MAD/m across all rolls of this fabric type. If no rolls
    // exist yet (sample created before any roll was bought), contribution
    // is 0 and the UI will show that explicitly so admins see the gap.
    const rolls = f.fabricType.rolls.filter((r) => !r.isDepleted);
    const avgMadPerMeter = rolls.length
      ? rolls.reduce((a, r) => a + Number(r.unitCostPerMeter), 0) / rolls.length
      : 0;
    const contribution = avgMetersPerPiece * avgMadPerMeter;
    fabricCost += contribution;
    fabricDetail.push({
      fabricTypeId: f.fabricTypeId,
      fabricTypeName: f.fabricType.name,
      avgMetersPerPiece,
      avgMadPerMeter,
      contribution,
    });
  }

  // ── Accessory cost ───────────────────────────────────────────────────────
  // Prefer the snapshot taken when the accessory was added; fall back to
  // the live AtelieMaterial.unitCost for legacy rows.
  let accessoryCost = 0;
  const accessoryDetail: SampleCostBreakdown['accessoryDetail'] = [];
  for (const a of test.accessories) {
    const snapshot = a.unitCostSnapshot != null ? Number(a.unitCostSnapshot) : null;
    const live = a.material.unitCost != null ? Number(a.material.unitCost) : 0;
    const unitCost = snapshot ?? live;
    const contribution = a.quantityPerPiece * unitCost;
    accessoryCost += contribution;
    accessoryDetail.push({
      materialId: a.materialId,
      materialName: a.material.name,
      quantityPerPiece: a.quantityPerPiece,
      unitCost,
      contribution,
    });
  }

  // ── Labor + fees ─────────────────────────────────────────────────────────
  const labor = test.laborMadPerPiece != null ? Number(test.laborMadPerPiece) : 0;
  const confirmation = test.confirmationFee != null ? Number(test.confirmationFee) : 0;
  const delivery = test.deliveryFee != null ? Number(test.deliveryFee) : 0;
  const fees = confirmation + delivery;

  const total = fabricCost + accessoryCost + labor + fees;

  // ── Suggested price ──────────────────────────────────────────────────────
  const markupPercent = test.markupPercent != null ? Number(test.markupPercent) : null;
  const suggestedPrice = markupPercent != null
    ? round2(total * (1 + markupPercent / 100))
    : null;

  return {
    fabric: round2(fabricCost),
    accessories: round2(accessoryCost),
    labor: round2(labor),
    fees: round2(fees),
    total: round2(total),
    suggestedPrice,
    fabricDetail: fabricDetail.map((d) => ({
      ...d,
      avgMetersPerPiece: round3(d.avgMetersPerPiece),
      avgMadPerMeter: round2(d.avgMadPerMeter),
      contribution: round2(d.contribution),
    })),
    accessoryDetail: accessoryDetail.map((d) => ({
      ...d,
      unitCost: round2(d.unitCost),
      contribution: round2(d.contribution),
    })),
  };
}

/**
 * Persist the freshly computed `estimatedCostPerPiece` and `suggestedPrice`
 * back onto the ProductTest row so list endpoints don't have to recompute.
 * Called from createTest / updateTest after any mutation that could shift
 * the math (sizes, fabrics, accessories, fees, markup).
 */
export async function persistSampleCost(testId: string): Promise<SampleCostBreakdown> {
  const breakdown = await computeSampleCost({ testId });
  await prisma.productTest.update({
    where: { id: testId },
    data: {
      estimatedCostPerPiece: breakdown.total,
      suggestedPrice: breakdown.suggestedPrice,
    },
  });
  return breakdown;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}
