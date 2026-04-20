import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, RotateCcw } from 'lucide-react';
import { GlassCard, CRMButton, GlassModal, CRMInput } from '@/components/ui';
import { atelieApi, type SalaryRow } from '@/services/atelieApi';
import { mondayOfWeekUTC, addWeeks, formatWeekRange } from '../utils/weekMath';

export function SalaryTab() {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOfWeekUTC());
  const [rows, setRows] = useState<SalaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState<SalaryRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await atelieApi.listWeekSalaries(weekStart.toISOString());
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.earned += r.amount;
      if (r.isPaid) acc.paid += r.paidAmount || r.amount;
      else acc.unpaid += r.amount;
      return acc;
    },
    { earned: 0, paid: 0, unpaid: 0 },
  );

  async function unpay(id: string) {
    if (!window.confirm('Revert this payment?')) return;
    await atelieApi.unpaySalary(id);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((d) => addWeeks(d, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label="Previous"
          >
            <ChevronLeft size={14} />
          </button>
          <div className="rounded-btn border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700">
            {formatWeekRange(weekStart.toISOString())}
          </div>
          <button
            onClick={() => setWeekStart((d) => addWeeks(d, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label="Next"
          >
            <ChevronRight size={14} />
          </button>
          <CRMButton variant="ghost" size="sm" onClick={() => setWeekStart(mondayOfWeekUTC())}>
            This week
          </CRMButton>
        </div>

        <div className="flex gap-2">
          <Pill label="Earned" value={totals.earned} tone="neutral" />
          <Pill label="Paid" value={totals.paid} tone="green" />
          <Pill label="Outstanding" value={totals.unpaid} tone="amber" />
        </div>
      </div>

      <GlassCard padding="none" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/70 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Employee</th>
              <th className="px-3 py-3 text-left font-medium">Role</th>
              <th className="px-3 py-3 text-right font-medium">Amount</th>
              <th className="px-3 py-3 text-right font-medium">Paid</th>
              <th className="px-3 py-3 text-center font-medium">Status</th>
              <th className="px-3 py-3 text-right font-medium">Paid by</th>
              <th className="px-3 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">
                  No payroll rows this week yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900">{r.employee.name}</td>
                <td className="px-3 py-2.5 capitalize text-gray-500">{r.employee.role}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                  {r.amount.toFixed(0)} MAD
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {r.isPaid ? `${(r.paidAmount || r.amount).toFixed(0)} MAD` : '—'}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={
                      r.isPaid
                        ? 'rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-600'
                        : 'rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600'
                    }
                  >
                    {r.isPaid ? 'Paid' : 'Unpaid'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-gray-500">
                  {r.paidBy?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {r.isPaid ? (
                    <button
                      onClick={() => unpay(r.id)}
                      className="inline-flex items-center gap-1 rounded-btn border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
                    >
                      <RotateCcw size={12} /> Revert
                    </button>
                  ) : (
                    <button
                      onClick={() => setPaying(r)}
                      className="inline-flex items-center gap-1 rounded-btn bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-dark"
                    >
                      <Check size={12} /> Mark paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      {paying && <PayModal row={paying} onClose={() => setPaying(null)} onSaved={load} />}
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'neutral' }) {
  const toneCls =
    tone === 'green'
      ? 'bg-green-50 text-green-600'
      : tone === 'amber'
      ? 'bg-amber-50 text-amber-600'
      : 'bg-gray-50 text-gray-600';
  return (
    <div className={`rounded-full px-3 py-1.5 text-xs font-semibold ${toneCls}`}>
      {label}: {value.toFixed(0)} MAD
    </div>
  );
}

function PayModal({ row, onClose, onSaved }: { row: SalaryRow; onClose: () => void; onSaved: () => void }) {
  const [paidAmount, setPaidAmount] = useState<number>(row.amount);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      await atelieApi.paySalary(row.id, { paidAmount, notes: notes.trim() || undefined });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open
      onClose={onClose}
      title={`Pay ${row.employee.name}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </CRMButton>
          <CRMButton onClick={confirm} loading={saving}>
            Confirm payment
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label="Amount paid (MAD)"
          type="number"
          min={0}
          step={10}
          value={paidAmount}
          onChange={(e) => setPaidAmount(Number(e.target.value))}
          hint={`Salary due: ${row.amount.toFixed(0)} MAD`}
        />
        <CRMInput
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </GlassModal>
  );
}
