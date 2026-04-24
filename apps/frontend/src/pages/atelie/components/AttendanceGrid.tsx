import { useEffect, useMemo, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, BarChart3, Trash2, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard, CRMButton } from '@/components/ui';
import {
  atelieApi,
  type AtelieEmployee,
  type AttendanceRow,
  type DayState,
} from '@/services/atelieApi';
import { mondayOfWeekUTC, addWeeks, formatWeekRange } from '../utils/weekMath';
import { EmployeeFormModal } from './EmployeeFormModal';
import { EmployeeKpiModal } from './EmployeeKpiModal';

// Tri-state cycle on click: absent → full → half → absent.
function nextState(current: DayState): DayState {
  if (current === 'absent') return 'full';
  if (current === 'full') return 'half';
  return 'absent';
}

function cellState(row: AttendanceRow, dayIndex: number): DayState {
  const bit = 1 << dayIndex;
  if ((row.daysMask & bit) !== 0) return 'full';
  if ((row.halfDaysMask & bit) !== 0) return 'half';
  return 'absent';
}

function applyDayState(
  daysMask: number,
  halfDaysMask: number,
  index: number,
  state: DayState,
): { daysMask: number; halfDaysMask: number } {
  const bit = 1 << index;
  const f = daysMask & 0b1111111;
  const h = halfDaysMask & 0b1111111;
  if (state === 'full') return { daysMask: f | bit, halfDaysMask: h & ~bit };
  if (state === 'half') return { daysMask: f & ~bit, halfDaysMask: h | bit };
  return { daysMask: f & ~bit, halfDaysMask: h & ~bit };
}

function popcount(n: number): number {
  let c = 0;
  for (let i = 0; i < 7; i++) if (n & (1 << i)) c++;
  return c;
}

export function AttendanceGrid() {
  const { t } = useTranslation();
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOfWeekUTC());
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [employees, setEmployees] = useState<AtelieEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AtelieEmployee | null>(null);
  const [kpiOpen, setKpiOpen] = useState(false);
  const [kpiEmp, setKpiEmp] = useState<{ id: string; name: string } | null>(null);

  const dayLabels = useMemo(
    () => [
      t('atelie.attendance.days.mon'),
      t('atelie.attendance.days.tue'),
      t('atelie.attendance.days.wed'),
      t('atelie.attendance.days.thu'),
      t('atelie.attendance.days.fri'),
      t('atelie.attendance.days.sat'),
      t('atelie.attendance.days.sun'),
    ],
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grid, list] = await Promise.all([
        atelieApi.getWeeklyGrid(weekStart.toISOString()),
        atelieApi.listEmployees(true),
      ]);
      setRows(grid.data);
      setEmployees(list);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleCell(row: AttendanceRow, dayIndex: number) {
    const current = cellState(row, dayIndex);
    const state = nextState(current);
    const key = `${row.employeeId}:${dayIndex}`;
    setPendingKey(key);

    const next = applyDayState(row.daysMask, row.halfDaysMask, dayIndex, state);
    const nextDaysWorked = popcount(next.daysMask) + popcount(next.halfDaysMask) * 0.5;
    const perDay = row.baseSalary / Math.max(1, row.workingDays);
    const nextAmount = Math.round(nextDaysWorked * perDay * 100) / 100;
    setRows((prev) =>
      prev.map((r) =>
        r.employeeId === row.employeeId
          ? {
              ...r,
              daysMask: next.daysMask,
              halfDaysMask: next.halfDaysMask,
              daysWorked: nextDaysWorked,
              amount: nextAmount,
            }
          : r,
      ),
    );

    try {
      await atelieApi.toggleAttendanceDay({
        employeeId: row.employeeId,
        weekStart: weekStart.toISOString(),
        dayIndex,
        state,
      });
    } catch {
      load();
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteEmployee(emp: AtelieEmployee) {
    if (!window.confirm(t('atelie.attendance.confirmDeactivate', { name: emp.name }))) return;
    await atelieApi.deactivateEmployee(emp.id);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((d) => addWeeks(d, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label={t('atelie.attendance.previousWeek')}
          >
            <ChevronLeft size={14} />
          </button>
          <div className="rounded-btn border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700">
            {formatWeekRange(weekStart.toISOString())}
          </div>
          <button
            onClick={() => setWeekStart((d) => addWeeks(d, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label={t('atelie.attendance.nextWeek')}
          >
            <ChevronRight size={14} />
          </button>
          <CRMButton
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart(mondayOfWeekUTC())}
          >
            {t('atelie.attendance.thisWeek')}
          </CRMButton>
        </div>

        <CRMButton
          leftIcon={<Plus size={14} />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t('atelie.attendance.addEmployee')}
        </CRMButton>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-gray-200 bg-white" />
          {t('atelie.attendance.legendAbsent')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary" />
          {t('atelie.attendance.legendFull')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-400" />
          {t('atelie.attendance.legendHalf')}
        </span>
        <span className="ml-auto text-gray-400">{t('atelie.attendance.legendHint')}</span>
      </div>

      <GlassCard padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-xs text-gray-500">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50/70 px-4 py-3 text-left font-medium">
                  {t('atelie.attendance.columns.employee')}
                </th>
                <th className="px-3 py-3 text-left font-medium">
                  {t('atelie.attendance.columns.role')}
                </th>
                {dayLabels.map((d) => (
                  <th key={d} className="px-2 py-3 text-center font-medium">
                    {d}
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-medium">
                  {t('atelie.attendance.columns.days')}
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  {t('atelie.attendance.columns.salary')}
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  {t('atelie.attendance.columns.status')}
                </th>
                <th className="px-3 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-sm text-gray-400">
                    {t('atelie.attendance.loading')}
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-sm text-gray-400">
                    {t('atelie.attendance.empty')}
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const emp = employees.find((e) => e.id === r.employeeId);
                return (
                  <tr key={r.employeeId} className="border-t border-gray-100">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-gray-900">
                      {r.employeeName}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-gray-500">{r.role}</td>
                    {dayLabels.map((_, i) => {
                      const state = cellState(r, i);
                      const isPending = pendingKey === `${r.employeeId}:${i}`;
                      const cls =
                        state === 'full'
                          ? 'bg-primary text-white shadow-sm hover:scale-105'
                          : state === 'half'
                            ? 'bg-amber-400 text-white shadow-sm hover:scale-105'
                            : 'border border-gray-200 text-gray-300 hover:border-primary hover:text-primary';
                      return (
                        <td key={i} className="px-1 py-2.5 text-center">
                          <button
                            onClick={() => !isPending && toggleCell(r, i)}
                            className={`h-7 w-7 rounded-btn transition-all ${cls}`}
                            disabled={isPending}
                            aria-label={t('atelie.attendance.toggleDay', { day: dayLabels[i] })}
                            title={state}
                          >
                            {state === 'full' ? '✓' : state === 'half' ? '½' : ''}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right font-medium text-gray-700">
                      {r.daysWorked}/{r.workingDays}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                      {r.amount.toFixed(0)} MAD
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={
                          r.isPaid
                            ? 'rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-600'
                            : 'rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600'
                        }
                      >
                        {r.isPaid ? t('atelie.attendance.paid') : t('atelie.attendance.unpaid')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setKpiEmp({ id: r.employeeId, name: r.employeeName });
                            setKpiOpen(true);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-accent hover:text-primary"
                          aria-label={t('atelie.attendance.viewKpis')}
                        >
                          <BarChart3 size={14} />
                        </button>
                        {emp && (
                          <button
                            onClick={() => {
                              setEditing(emp);
                              setFormOpen(true);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-accent hover:text-primary"
                            aria-label={t('atelie.attendance.edit')}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {emp && (
                          <button
                            onClick={() => deleteEmployee(emp)}
                            className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                            aria-label={t('atelie.attendance.deactivate')}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <EmployeeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        employee={editing}
      />

      <EmployeeKpiModal
        open={kpiOpen}
        onClose={() => setKpiOpen(false)}
        employeeId={kpiEmp?.id ?? null}
        employeeName={kpiEmp?.name ?? ''}
      />
    </div>
  );
}
