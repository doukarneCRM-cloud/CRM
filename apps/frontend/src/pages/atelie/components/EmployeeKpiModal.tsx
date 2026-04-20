import { useEffect, useState } from 'react';
import { GlassModal } from '@/components/ui';
import { atelieApi, type EmployeeKpis } from '@/services/atelieApi';
import { formatWeekRange } from '../utils/weekMath';

interface Props {
  open: boolean;
  onClose: () => void;
  employeeId: string | null;
  employeeName: string;
}

export function EmployeeKpiModal({ open, onClose, employeeId, employeeName }: Props) {
  const [kpis, setKpis] = useState<EmployeeKpis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !employeeId) return;
    setLoading(true);
    atelieApi
      .getEmployeeKpis(employeeId)
      .then(setKpis)
      .finally(() => setLoading(false));
  }, [open, employeeId]);

  return (
    <GlassModal open={open} onClose={onClose} title={`KPIs — ${employeeName}`} size="2xl">
      {loading || !kpis ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="Total weeks" value={kpis.totalWeeks} />
            <KpiTile label="Days present" value={kpis.totalDaysPresent} />
            <KpiTile label="Avg days/week" value={kpis.avgDaysPerWeek.toFixed(1)} />
            <KpiTile label="Attendance" value={`${Math.round(kpis.attendanceRate * 100)}%`} />
            <KpiTile label="Total earned" value={`${kpis.totalEarned.toFixed(0)} MAD`} />
            <KpiTile label="Total paid" value={`${kpis.totalPaid.toFixed(0)} MAD`} />
            <KpiTile label="Outstanding" value={`${kpis.outstanding.toFixed(0)} MAD`} accent />
            <KpiTile label="Longest streak" value={`${kpis.longestStreak}w`} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Last {kpis.weekly.length} weeks</h3>
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Week</th>
                    <th className="px-3 py-2 text-center font-medium">Days</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.weekly.map((w) => (
                    <tr key={w.weekStart} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-700">{formatWeekRange(w.weekStart)}</td>
                      <td className="px-3 py-2 text-center text-gray-700">{w.daysWorked}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {w.amount.toFixed(0)} MAD
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={
                            w.isPaid
                              ? 'rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-600'
                              : 'rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600'
                          }
                        >
                          {w.isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {kpis.weekly.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-400">
                        No attendance yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </GlassModal>
  );
}

function KpiTile({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${accent ? 'text-amber-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
