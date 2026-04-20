import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Paperclip,
  Receipt,
  Calendar,
  DollarSign,
  Upload,
  FileText,
  X,
  Download,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { KPICard } from '@/components/ui/KPICard';
import { FilePreviewModal } from '@/components/ui/FilePreviewModal';
import { FbDateRangePicker } from '@/components/ui/FbDateRangePicker';
import { rowsToCsv, downloadCsv } from '@/lib/csv';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { moneyApi, type Expense } from '@/services/moneyApi';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function fmtMAD(n: number): string {
  return `${n.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ExpensesTab() {
  const canManage = useAuthStore((s) => s.hasPermission(PERMISSIONS.MONEY_MANAGE));

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [data, setData] = useState<{
    rows: Expense[];
    total: number;
    totalAmount: number;
    totalPages: number;
  }>({ rows: [], total: 0, totalAmount: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const r = await moneyApi.listExpenses({
        page: 1,
        pageSize: 1000,
        search: debounced || undefined,
        dateFrom: dateRange.from ?? undefined,
        dateTo: dateRange.to ?? undefined,
      });
      const csv = rowsToCsv(
        ['Date', 'Description', 'Amount (MAD)', 'File', 'Recorded by'],
        r.data.map((e) => [
          e.date.slice(0, 10),
          e.description,
          e.amount.toFixed(2),
          e.fileUrl ?? '',
          e.addedBy?.name ?? '',
        ]),
      );
      const suffix = dateRange.from || dateRange.to
        ? `_${dateRange.from ?? 'start'}_to_${dateRange.to ?? 'end'}`
        : '';
      downloadCsv(`expenses${suffix}.csv`, csv);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to export expenses'));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, dateRange.from, dateRange.to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    moneyApi
      .listExpenses({
        page,
        pageSize: 25,
        search: debounced || undefined,
        dateFrom: dateRange.from ?? undefined,
        dateTo: dateRange.to ?? undefined,
      })
      .then((r) => {
        if (cancelled) return;
        setData({
          rows: r.data,
          total: r.pagination.total,
          totalAmount: r.totalAmount,
          totalPages: r.pagination.totalPages,
        });
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, 'Failed to load expenses'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debounced, reloadKey, dateRange.from, dateRange.to]);

  const handleDelete = async (e: Expense) => {
    if (!confirm(`Delete expense "${e.description}"?`)) return;
    try {
      await moneyApi.deleteExpense(e.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete expense'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-card border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KPICard
          title="Total Expenses"
          value={fmtMAD(data.totalAmount)}
          icon={DollarSign}
          iconColor="#EF4444"
        />
        <KPICard
          title="Entries"
          value={data.total.toLocaleString('fr-MA')}
          icon={Receipt}
          iconColor="#6366F1"
        />
        <KPICard
          title="Avg / Entry"
          value={fmtMAD(data.total > 0 ? data.totalAmount / data.total : 0)}
          icon={Calendar}
          iconColor="#10B981"
        />
      </div>

      <GlassCard className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <CRMInput
              leftIcon={<Search size={14} />}
              placeholder="Search description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              wrapperClassName="flex-1 max-w-md"
            />
            <FbDateRangePicker
              value={dateRange}
              onChange={(r) => setDateRange(r)}
              placeholder="Any date"
            />
          </div>
          <div className="flex items-center gap-2">
            <CRMButton
              variant="secondary"
              size="sm"
              leftIcon={<Download size={13} />}
              loading={exporting}
              disabled={data.total === 0}
              onClick={handleExport}
            >
              Export CSV
            </CRMButton>
            {canManage && (
              <CRMButton
                leftIcon={<Plus size={14} />}
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                Add Expense
              </CRMButton>
            )}
          </div>
        </div>

        {loading ? (
          <div className="skeleton h-[280px] w-full rounded-xl" />
        ) : data.rows.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center text-gray-400">
            <Receipt size={28} className="text-gray-300" />
            <p className="text-sm">
              {debounced ? 'No expenses match this search.' : 'No expenses recorded yet.'}
            </p>
            {canManage && !debounced && (
              <CRMButton
                size="sm"
                variant="ghost"
                leftIcon={<Plus size={14} />}
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                Record your first expense
              </CRMButton>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Description</th>
                  <th className="py-2 pr-2 text-right">Amount</th>
                  <th className="py-2 pr-2">File</th>
                  <th className="py-2 pr-2">Recorded by</th>
                  {canManage && <th className="py-2 pr-2 w-[1%]" />}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((e) => (
                  <tr key={e.id} className="border-t border-gray-50 hover:bg-accent/40">
                    <td className="py-2.5 pr-2 whitespace-nowrap text-gray-600">{fmtDate(e.date)}</td>
                    <td className="py-2.5 pr-2 text-gray-900">{e.description}</td>
                    <td className="py-2.5 pr-2 text-right font-semibold text-gray-900">
                      {fmtMAD(e.amount)}
                    </td>
                    <td className="py-2.5 pr-2">
                      {e.fileUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewUrl(`${BASE_URL}${e.fileUrl}`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          <Paperclip size={12} /> View
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-xs text-gray-500">
                      {e.addedBy?.name ?? '—'}
                    </td>
                    {canManage && (
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditing(e);
                              setShowForm(true);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-accent hover:text-primary"
                            aria-label="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(e)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            aria-label="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-500">
            <span>
              Page {page} of {data.totalPages} · {data.total} entries
            </span>
            <div className="flex items-center gap-2">
              <CRMButton
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </CRMButton>
              <CRMButton
                size="sm"
                variant="secondary"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              >
                Next
              </CRMButton>
            </div>
          </div>
        )}
      </GlassCard>

      {showForm && (
        <ExpenseFormModal
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      <FilePreviewModal
        open={previewUrl !== null}
        onClose={() => setPreviewUrl(null)}
        url={previewUrl ?? ''}
        title="Expense receipt"
      />
    </div>
  );
}

// ─── Form modal ─────────────────────────────────────────────────────────────

function ExpenseFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(editing?.description ?? '');
  const [amount, setAmount] = useState(editing?.amount?.toString() ?? '');
  const [date, setDate] = useState(
    editing?.date ? editing.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [fileUrl, setFileUrl] = useState<string | null>(editing?.fileUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isValid = useMemo(
    () => description.trim().length > 0 && Number(amount) > 0 && date.length >= 8,
    [description, amount, date],
  );

  const handleUpload = async (file: File) => {
    setUploading(true);
    setErr(null);
    try {
      const res = await moneyApi.uploadExpenseFile(file);
      setFileUrl(res.url);
    } catch (e) {
      setErr(apiErrorMessage(e, 'Failed to upload file'));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        description: description.trim(),
        amount: Number(amount),
        date,
        fileUrl,
      };
      if (editing) {
        await moneyApi.updateExpense(editing.id, payload);
      } else {
        await moneyApi.createExpense(payload);
      }
      onSaved();
    } catch (e) {
      setErr(apiErrorMessage(e, 'Failed to save expense'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open
      onClose={onClose}
      title={editing ? 'Edit Expense' : 'Record Expense'}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </CRMButton>
          <CRMButton onClick={handleSubmit} loading={saving} disabled={!isValid}>
            {editing ? 'Save changes' : 'Record expense'}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {err && (
          <div className="rounded-card border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {err}
          </div>
        )}

        <CRMInput
          label="Description"
          placeholder="e.g. Google Ads — October campaign"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label="Amount (MAD)"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <CRMInput
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        {/* File attachment */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">Attachment</span>
          {fileUrl ? (
            <div className="flex items-center justify-between rounded-card border border-gray-200 bg-gray-50 px-3 py-2">
              <a
                href={`${BASE_URL}${fileUrl}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-xs font-medium text-primary hover:underline"
              >
                <FileText size={14} className="shrink-0" />
                <span className="truncate">{fileUrl.split('/').pop()}</span>
              </a>
              <button
                onClick={() => setFileUrl(null)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove file"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex items-center justify-center gap-2 rounded-card border border-dashed border-gray-300 px-4 py-4 text-xs font-medium text-gray-500 transition-colors hover:border-primary hover:bg-accent/40 hover:text-primary',
                uploading && 'cursor-not-allowed opacity-60',
              )}
            >
              <Upload size={14} />
              {uploading ? 'Uploading…' : 'Attach invoice or screenshot (PNG/JPG/PDF, ≤ 8 MB)'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </GlassModal>
  );
}
