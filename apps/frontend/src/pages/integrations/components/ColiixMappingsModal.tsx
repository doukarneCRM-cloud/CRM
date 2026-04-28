import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Search, X } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  coliixMappingsApi,
  type ColiixMapping,
  type InternalShippingStatus,
} from '@/services/coliixMappingsApi';
import { SHIPPING_STATUS_OPTIONS } from '@/constants/statusColors';
import { colourForColiixRawState } from '@/lib/coliixColour';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';

// Per-row save state — drives the inline icon (spinner / check / error).
type RowState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; affected: number }
  | { kind: 'error'; message: string };

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ColiixMappingsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit = hasPermission(PERMISSIONS.INTEGRATIONS_MANAGE);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<ColiixMapping[]>([]);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [search, setSearch] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await coliixMappingsApi.list();
      setMappings(list);
    } catch (e) {
      setError(apiErrorMessage(e, t('integrations.coliix.mappings.loadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter((m) => m.coliixWording.toLowerCase().includes(q));
  }, [mappings, search]);

  const handleChange = async (
    wording: string,
    rawValue: string,
  ) => {
    if (!canEdit) return;
    const internalStatus: InternalShippingStatus | null =
      rawValue === '__stay_raw__' ? null : (rawValue as InternalShippingStatus);

    setRowStates((s) => ({ ...s, [wording]: { kind: 'saving' } }));
    try {
      const result = await coliixMappingsApi.update(wording, { internalStatus });
      // Reflect the new value locally so the dropdown sticks even if the
      // refetch lags. Refetch in the background to refresh order counts /
      // bucket drift columns.
      setMappings((prev) =>
        prev.map((m) =>
          m.coliixWording === wording
            ? { ...m, internalStatus: result.mapping.internalStatus, updatedAt: result.mapping.updatedAt }
            : m,
        ),
      );
      setRowStates((s) => ({
        ...s,
        [wording]: { kind: 'saved', affected: result.affected },
      }));
      // Soft-refresh after a short delay so the operator sees the
      // checkmark before counts shift.
      setTimeout(() => {
        void refresh();
      }, 800);
    } catch (e) {
      setRowStates((s) => ({
        ...s,
        [wording]: {
          kind: 'error',
          message: apiErrorMessage(e, t('integrations.coliix.mappings.saveFailed')),
        },
      }));
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('integrations.coliix.mappings.title')}
      size="lg"
    >
      <p className="mb-3 text-xs text-gray-500">
        {t('integrations.coliix.mappings.description')}
      </p>

      {/* Search */}
      <div className="mb-3 flex h-9 items-center gap-2 rounded-input border border-gray-200 bg-white px-3 focus-within:border-primary">
        <Search size={14} className="text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('integrations.coliix.mappings.searchPlaceholder')}
          className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder-gray-400"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-gray-400 hover:text-gray-600"
            aria-label={t('integrations.coliix.mappings.clearSearch')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">
          {t('integrations.coliix.mappings.empty')}
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <ul className="flex flex-col gap-1.5">
            {filtered.map((m) => (
              <MappingRow
                key={m.coliixWording}
                mapping={m}
                rowState={rowStates[m.coliixWording] ?? { kind: 'idle' }}
                canEdit={canEdit}
                onChange={(v) => handleChange(m.coliixWording, v)}
              />
            ))}
          </ul>
        </div>
      )}
    </GlassModal>
  );
}

function MappingRow({
  mapping,
  rowState,
  canEdit,
  onChange,
}: {
  mapping: ColiixMapping;
  rowState: RowState;
  canEdit: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const colour = colourForColiixRawState(mapping.coliixWording);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white/60 px-3 py-2">
      {/* Wording + count */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: colour }}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {mapping.coliixWording}
          </p>
          <p className="text-[10px] text-gray-400">
            {t('integrations.coliix.mappings.orderCount', { count: mapping.orderCount })}
          </p>
        </div>
      </div>

      {/* Mapping dropdown */}
      <select
        value={mapping.internalStatus ?? '__stay_raw__'}
        disabled={!canEdit || rowState.kind === 'saving'}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-input border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 outline-none focus:border-primary disabled:opacity-50"
      >
        <option value="__stay_raw__">
          {t('integrations.coliix.mappings.stayRaw')}
        </option>
        {SHIPPING_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Inline save state */}
      <div className="flex w-24 shrink-0 items-center justify-end">
        {rowState.kind === 'saving' && (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        )}
        {rowState.kind === 'saved' && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[10px] font-semibold',
              rowState.affected > 0 ? 'text-emerald-600' : 'text-gray-400',
            )}
          >
            <Check size={12} />
            {rowState.affected > 0
              ? t('integrations.coliix.mappings.savedWithAffected', {
                  count: rowState.affected,
                })
              : t('integrations.coliix.mappings.savedNoChange')}
          </span>
        )}
        {rowState.kind === 'error' && (
          <span
            title={rowState.message}
            className="text-[10px] font-semibold text-red-600"
          >
            {t('integrations.coliix.mappings.saveFailedShort')}
          </span>
        )}
      </div>
    </li>
  );
}
