import { CheckCircle2, XCircle } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import type { ExportResult } from '@/services/providersApi';

interface ColiixExportResultModalProps {
  open: boolean;
  onClose: () => void;
  results: ExportResult[];
  summary: { total: number; ok: number; failed: number };
}

export function ColiixExportResultModal({
  open,
  onClose,
  results,
  summary,
}: ColiixExportResultModalProps) {
  const okRows = results.filter((r) => r.ok);
  const failRows = results.filter((r) => !r.ok);

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Coliix export"
      size="xl"
      footer={
        <div className="flex justify-end">
          <CRMButton variant="primary" size="sm" onClick={onClose}>
            Close
          </CRMButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Summary header */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Total</p>
            <p className="text-lg font-bold text-gray-900">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-emerald-600">Sent</p>
            <p className="text-lg font-bold text-emerald-700">{summary.ok}</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-red-600">Failed</p>
            <p className="text-lg font-bold text-red-700">{summary.failed}</p>
          </div>
        </div>

        {/* Failures first — they need attention */}
        {failRows.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
              <XCircle size={14} /> Failed ({failRows.length})
            </h4>
            <ul className="space-y-1.5">
              {failRows.map((r) => (
                <li
                  key={r.orderId}
                  className="flex items-start justify-between gap-3 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-xs"
                >
                  <span className="font-mono font-semibold text-red-800">{r.reference}</span>
                  <span className="text-right text-red-700">{r.error ?? 'Unknown error'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Successes */}
        {okRows.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={14} /> Sent ({okRows.length})
            </h4>
            <ul className="space-y-1.5">
              {okRows.map((r) => (
                <li
                  key={r.orderId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs"
                >
                  <span className="font-mono font-semibold text-emerald-800">{r.reference}</span>
                  <span className="font-mono text-emerald-700">
                    {r.tracking ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {results.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">No results to show.</p>
        )}
      </div>
    </GlassModal>
  );
}
