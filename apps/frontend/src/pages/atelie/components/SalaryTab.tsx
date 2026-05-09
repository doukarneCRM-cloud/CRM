import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, RotateCcw, Plus, Eye, Printer, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard, CRMButton, GlassModal, CRMInput } from '@/components/ui';
import { atelieApi, type SalaryRow } from '@/services/atelieApi';
import { mondayOfWeekUTC, addWeeks, formatWeekRange } from '../utils/weekMath';
import { printSalaryLabel } from '../utils/printSalaryLabel';

// Prisma Decimal columns serialize to string in JSON responses. Coerce
// every numeric field at the boundary so downstream `.toFixed()`,
// arithmetic, and totals can't trip over a stray "500.00" string.
function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeRow(r: SalaryRow): SalaryRow {
  return {
    ...r,
    amount: num(r.amount),
    paidAmount: num(r.paidAmount),
    commission: num(r.commission),
    supplementHours: num(r.supplementHours),
    supplementHourRate: num(r.supplementHourRate),
    daysWorked: num(r.daysWorked),
  };
}

/** Pay total = base salary + commission + (supplement hours × rate). */
function rowTotal(r: SalaryRow): number {
  return r.amount + r.commission + r.supplementHours * r.supplementHourRate;
}

export function SalaryTab() {
  const { t } = useTranslation();
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOfWeekUTC());
  const [rows, setRows] = useState<SalaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paying, setPaying] = useState<SalaryRow | null>(null);
  const [editingExtras, setEditingExtras] = useState<SalaryRow | null>(null);
  const [viewingExtras, setViewingExtras] = useState<SalaryRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await atelieApi.listWeekSalaries(weekStart.toISOString());
      setRows((res.data ?? []).map(normalizeRow));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } }; status?: number } };
      const msg =
        err?.response?.data?.error?.message ||
        (err?.response?.status ? `HTTP ${err.response.status}` : 'Failed to load salaries');
      setLoadError(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = rows.reduce(
    (acc, r) => {
      const total = rowTotal(r);
      acc.earned += total;
      if (r.isPaid) acc.paid += r.paidAmount || r.amount;
      else acc.unpaid += total;
      return acc;
    },
    { earned: 0, paid: 0, unpaid: 0 },
  );

  async function unpay(id: string) {
    if (!window.confirm(t('atelie.salary.confirmRevert'))) return;
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
            aria-label={t('atelie.salary.previous')}
          >
            <ChevronLeft size={14} />
          </button>
          <div className="rounded-btn border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700">
            {formatWeekRange(weekStart.toISOString())}
          </div>
          <button
            onClick={() => setWeekStart((d) => addWeeks(d, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label={t('atelie.salary.next')}
          >
            <ChevronRight size={14} />
          </button>
          <CRMButton variant="ghost" size="sm" onClick={() => setWeekStart(mondayOfWeekUTC())}>
            {t('atelie.salary.thisWeek')}
          </CRMButton>
        </div>

        <div className="flex gap-2">
          <Pill label={t('atelie.salary.pillEarned')} value={totals.earned} tone="neutral" />
          <Pill label={t('atelie.salary.pillPaid')} value={totals.paid} tone="green" />
          <Pill label={t('atelie.salary.pillOutstanding')} value={totals.unpaid} tone="amber" />
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{t('atelie.salary.loadFailed')}</p>
            <p className="text-xs text-amber-700">{loadError}</p>
            <p className="mt-1 text-xs text-amber-700">
              {t('atelie.salary.loadFailedHint')}
            </p>
          </div>
        </div>
      )}

      <GlassCard padding="none" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/70 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{t('atelie.salary.columns.employee')}</th>
              <th className="px-3 py-3 text-left font-medium">{t('atelie.salary.columns.role')}</th>
              <th className="px-3 py-3 text-right font-medium">{t('atelie.salary.columns.amount')}</th>
              <th className="px-3 py-3 text-right font-medium">{t('atelie.salary.columns.paid')}</th>
              <th className="px-3 py-3 text-center font-medium">{t('atelie.salary.columns.status')}</th>
              <th className="px-3 py-3 text-right font-medium">{t('atelie.salary.columns.paidBy')}</th>
              <th className="px-3 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">
                  {t('atelie.salary.loading')}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">
                  {t('atelie.salary.empty')}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const supplementPay = r.supplementHours * r.supplementHourRate;
              const hasExtras =
                r.commission > 0 ||
                r.supplementHours > 0 ||
                supplementPay > 0 ||
                (r.notes && r.notes.trim().length > 0);
              const extrasTotal = r.commission + supplementPay;
              const total = r.amount + extrasTotal;
              return (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{r.employee.name}</td>
                  <td className="px-3 py-2.5 capitalize text-gray-500">{r.employee.role}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                    {total.toFixed(0)} MAD
                    {extrasTotal > 0 && (
                      <span className="ml-1 text-[10px] font-normal text-tone-lavender-500">
                        +{extrasTotal.toFixed(0)}
                      </span>
                    )}
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
                      {r.isPaid ? t('atelie.salary.paid') : t('atelie.salary.unpaid')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-500">
                    {r.paidBy?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <IconButton
                        onClick={() => setEditingExtras(r)}
                        ariaLabel={t('atelie.salary.editExtras')}
                        title={t('atelie.salary.editExtras')}
                      >
                        <Plus size={13} />
                      </IconButton>
                      <IconButton
                        onClick={() => setViewingExtras(r)}
                        ariaLabel={t('atelie.salary.viewExtras')}
                        title={t('atelie.salary.viewExtras')}
                        highlight={Boolean(hasExtras)}
                      >
                        <Eye size={13} />
                      </IconButton>
                      <IconButton
                        onClick={() => printSalaryLabel(r, weekStart.toISOString(), t)}
                        ariaLabel={t('atelie.salary.printLabel')}
                        title={t('atelie.salary.printLabel')}
                      >
                        <Printer size={13} />
                      </IconButton>
                      {r.isPaid ? (
                        <button
                          onClick={() => unpay(r.id)}
                          className="ml-1 inline-flex items-center gap-1 rounded-btn border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
                        >
                          <RotateCcw size={12} /> {t('atelie.salary.revert')}
                        </button>
                      ) : (
                        <button
                          onClick={() => setPaying(r)}
                          className="ml-1 inline-flex items-center gap-1 rounded-btn bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-dark"
                        >
                          <Check size={12} /> {t('atelie.salary.markPaid')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassCard>

      {paying && <PayModal row={paying} onClose={() => setPaying(null)} onSaved={load} />}
      {editingExtras && (
        <ExtrasModal
          row={editingExtras}
          onClose={() => setEditingExtras(null)}
          onSaved={load}
        />
      )}
      {viewingExtras && (
        <ViewExtrasModal row={viewingExtras} onClose={() => setViewingExtras(null)} />
      )}
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

function IconButton({
  children,
  onClick,
  ariaLabel,
  title,
  highlight,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  title: string;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={
        highlight
          ? 'flex h-7 w-7 items-center justify-center rounded-btn border border-tone-lavender-200 bg-tone-lavender-50 text-tone-lavender-500 hover:bg-tone-lavender-100'
          : 'flex h-7 w-7 items-center justify-center rounded-btn border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      }
    >
      {children}
    </button>
  );
}

function PayModal({ row, onClose, onSaved }: { row: SalaryRow; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const total = rowTotal(row);
  const [paidAmount, setPaidAmount] = useState<number>(total);
  const [notes, setNotes] = useState(row.notes ?? '');
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
      title={t('atelie.salary.payTitle', { name: row.employee.name })}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </CRMButton>
          <CRMButton onClick={confirm} loading={saving}>
            {t('atelie.salary.confirmPayment')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label={t('atelie.salary.payAmount')}
          type="number"
          min={0}
          step={10}
          value={paidAmount}
          onChange={(e) => setPaidAmount(Number(e.target.value))}
          hint={t('atelie.salary.payHint', { amount: total.toFixed(0) })}
        />
        <CRMInput
          label={t('atelie.salary.payNotes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </GlassModal>
  );
}

function ExtrasModal({
  row,
  onClose,
  onSaved,
}: {
  row: SalaryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [commission, setCommission] = useState<number>(row.commission || 0);
  const [supplementHours, setSupplementHours] = useState<number>(row.supplementHours || 0);
  const [supplementHourRate, setSupplementHourRate] = useState<number>(row.supplementHourRate || 0);
  const [notes, setNotes] = useState(row.notes ?? '');
  const [saving, setSaving] = useState(false);

  const supplementPay = supplementHours * supplementHourRate;
  const newTotal = row.amount + commission + supplementPay;

  async function save() {
    setSaving(true);
    try {
      await atelieApi.updateSalaryExtras(row.id, {
        commission,
        supplementHours,
        supplementHourRate,
        notes: notes.trim() ? notes.trim() : null,
      });
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
      title={t('atelie.salary.extrasTitle', { name: row.employee.name })}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </CRMButton>
          <CRMButton onClick={save} loading={saving}>
            {t('common.save')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label={t('atelie.salary.commission')}
          type="number"
          min={0}
          step={10}
          value={commission}
          onChange={(e) => setCommission(Number(e.target.value) || 0)}
          hint={t('atelie.salary.commissionHint')}
        />
        <div className="grid grid-cols-2 gap-2">
          <CRMInput
            label={t('atelie.salary.supplementHours')}
            type="number"
            min={0}
            step={0.5}
            value={supplementHours}
            onChange={(e) => setSupplementHours(Number(e.target.value) || 0)}
            hint={t('atelie.salary.supplementHoursHint')}
          />
          <CRMInput
            label={t('atelie.salary.supplementHourRate')}
            type="number"
            min={0}
            step={5}
            value={supplementHourRate}
            onChange={(e) => setSupplementHourRate(Number(e.target.value) || 0)}
            hint={t('atelie.salary.supplementHourRateHint')}
          />
        </div>
        {supplementPay > 0 && (
          <div className="rounded-card border border-tone-lavender-200 bg-tone-lavender-50 px-3 py-2 text-xs text-tone-lavender-700">
            {t('atelie.salary.supplementPayLine', {
              hours: supplementHours,
              rate: supplementHourRate.toFixed(0),
              pay: supplementPay.toFixed(0),
            })}
          </div>
        )}
        <CRMInput
          label={t('atelie.salary.note')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          hint={t('atelie.salary.noteHint')}
        />
        <div className="mt-1 flex items-center justify-between rounded-card bg-gray-50 px-3 py-2 text-sm">
          <span className="font-semibold uppercase tracking-wide text-gray-500">
            {t('atelie.salary.totalDue')}
          </span>
          <span className="text-base font-bold text-gray-900">{newTotal.toFixed(0)} MAD</span>
        </div>
      </div>
    </GlassModal>
  );
}

function ViewExtrasModal({ row, onClose }: { row: SalaryRow; onClose: () => void }) {
  const { t } = useTranslation();
  const supplementPay = row.supplementHours * row.supplementHourRate;
  const total = rowTotal(row);
  const empty =
    row.commission === 0 &&
    row.supplementHours === 0 &&
    supplementPay === 0 &&
    (!row.notes || row.notes.trim().length === 0);

  return (
    <GlassModal
      open
      onClose={onClose}
      title={t('atelie.salary.viewTitle', { name: row.employee.name })}
      size="sm"
      footer={
        <div className="flex justify-end">
          <CRMButton variant="ghost" onClick={onClose}>
            {t('common.close')}
          </CRMButton>
        </div>
      }
    >
      {empty ? (
        <p className="py-3 text-center text-sm text-gray-400">{t('atelie.salary.noExtras')}</p>
      ) : (
        <table className="w-full table-fixed border-collapse overflow-hidden rounded-card border border-gray-200 text-left text-sm">
          <tbody>
            <Row label={t('atelie.salary.daysWorked')} value={`${row.daysWorked}`} />
            <Row label={t('atelie.salary.baseAmount')} value={`${row.amount.toFixed(0)} MAD`} />
            <Row
              label={t('atelie.salary.commission')}
              value={`${row.commission.toFixed(0)} MAD`}
            />
            <Row
              label={t('atelie.salary.supplementHours')}
              value={
                row.supplementHourRate > 0 && row.supplementHours > 0
                  ? `${row.supplementHours} × ${row.supplementHourRate.toFixed(0)} = ${supplementPay.toFixed(0)} MAD`
                  : `${row.supplementHours}`
              }
            />
            <Row
              label={t('atelie.salary.totalDue')}
              value={`${total.toFixed(0)} MAD`}
              strong
            />
            {row.notes && row.notes.trim().length > 0 && (
              <Row label={t('atelie.salary.note')} value={row.notes} />
            )}
          </tbody>
        </table>
      )}
    </GlassModal>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <tr className="border-b border-gray-200 last:border-b-0">
      <th className="w-2/5 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </th>
      <td
        className={
          strong
            ? 'px-3 py-2 text-base font-bold text-gray-900'
            : 'px-3 py-2 text-sm text-gray-700'
        }
      >
        {value}
      </td>
    </tr>
  );
}
