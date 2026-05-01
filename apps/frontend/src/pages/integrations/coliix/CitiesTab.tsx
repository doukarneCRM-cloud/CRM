import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Search, Trash2, Save, AlertCircle } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  coliixApi,
  type CarrierAccount,
  type CarrierCity,
  type ImportCitiesSummary,
} from '@/services/coliixApi';
import { useToastStore } from '@/store/toastStore';

const PAGE_SIZE = 100;

export function CitiesTab() {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.push);
  const [accounts, setAccounts] = useState<CarrierAccount[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [cities, setCities] = useState<CarrierCity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportCitiesSummary | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load accounts once. Auto-pick the only one if there's just one — the
  // user expects a single-hub setup to skip the picker.
  useEffect(() => {
    let cancelled = false;
    coliixApi
      .listAccounts()
      .then((rows) => {
        if (cancelled) return;
        setAccounts(rows);
        if (rows.length > 0 && !accountId) setAccountId(rows[0].id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCities = useCallback(
    async (q?: string) => {
      if (!accountId) return;
      setLoading(true);
      try {
        const result = await coliixApi.listCities(accountId, {
          search: q,
          pageSize: PAGE_SIZE,
        });
        setCities(result.data);
        setTotal(result.pagination.total);
      } finally {
        setLoading(false);
      }
    },
    [accountId],
  );

  useEffect(() => {
    loadCities(search);
  }, [accountId, loadCities]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = (q: string) => {
    setSearch(q);
    loadCities(q);
  };

  const onUploadClick = () => fileInputRef.current?.click();

  const onFileChosen = async (file: File) => {
    if (!accountId) return;
    if (mode === 'replace' && !window.confirm(t('coliix.cities.confirmReplace'))) return;
    setImporting(true);
    setSummary(null);
    try {
      const res = await coliixApi.importCitiesCsv(accountId, file, mode);
      setSummary(res);
      toast({
        kind: 'success',
        title: t('coliix.cities.importDone'),
        body: t('coliix.cities.importBody', {
          imported: res.imported,
          unchanged: res.unchanged,
          removed: res.removed,
        }),
      });
      loadCities(search);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast({
        kind: 'error',
        title: e.response?.data?.error?.message ?? t('coliix.cities.importFail'),
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileChosen(file);
  };

  if (accounts.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="text-sm font-semibold text-gray-600">{t('coliix.cities.needAccount')}</p>
        <p className="mt-1 text-xs italic text-gray-400">
          {t('coliix.cities.needAccountHint')}
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('coliix.cities.title')}</h2>
          <p className="text-xs text-gray-500">{t('coliix.cities.subtitle')}</p>
        </div>
      </div>

      {/* Account picker (only when >1 hub) + import controls */}
      <div className="flex flex-wrap items-center gap-3">
        {accounts.length > 1 && (
          <select
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.hubLabel}
              </option>
            ))}
          </select>
        )}
        <div className="flex flex-1 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            placeholder={t('coliix.cities.searchPlaceholder')}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <select
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs"
          value={mode}
          onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}
          title={t('coliix.cities.modeHint') as string}
        >
          <option value="merge">{t('coliix.cities.modeMerge')}</option>
          <option value="replace">{t('coliix.cities.modeReplace')}</option>
        </select>
        <CRMButton
          variant="primary"
          size="sm"
          leftIcon={<Upload size={13} />}
          onClick={onUploadClick}
          loading={importing}
        >
          {t('coliix.cities.uploadCsv')}
        </CRMButton>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileChosen(f);
          }}
        />
      </div>

      {/* Drop zone (visible when no cities yet) */}
      {!loading && cities.length === 0 && !summary && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-card border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center"
        >
          <Upload size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">
            {t('coliix.cities.emptyTitle')}
          </p>
          <p className="mt-1 text-xs text-gray-500">{t('coliix.cities.emptyHint')}</p>
        </div>
      )}

      {/* Import summary banner */}
      {summary && (
        <ImportSummaryBanner summary={summary} onDismiss={() => setSummary(null)} />
      )}

      {/* Cities table */}
      {(loading || cities.length > 0) && (
        <GlassCard className="overflow-hidden p-0">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {t('coliix.cities.totalLabel', { count: total })}
            {search ? ` · ${t('coliix.cities.searching', { q: search })}` : ''}
          </div>
          {loading ? (
            <div className="skeleton h-32 w-full" />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white text-left text-[10px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">{t('coliix.cities.colName')}</th>
                    <th className="px-4 py-2 font-semibold">{t('coliix.cities.colZone')}</th>
                    <th className="px-4 py-2 text-right font-semibold">
                      {t('coliix.cities.colFee')}
                    </th>
                    <th className="px-4 py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map((c) => (
                    <CityRow key={c.id} city={c} onChanged={() => loadCities(search)} />
                  ))}
                </tbody>
              </table>
              {total > cities.length && (
                <div className="border-t border-gray-100 px-4 py-2 text-center text-[11px] italic text-gray-400">
                  {t('coliix.cities.showing', { shown: cities.length, total })}
                </div>
              )}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}

// ─── One city row (inline edit on save) ─────────────────────────────────────

function CityRow({ city, onChanged }: { city: CarrierCity; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.push);
  const [zone, setZone] = useState(city.zone ?? '');
  const [price, setPrice] = useState(city.deliveryPrice === null ? '' : String(city.deliveryPrice));
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () =>
      (zone || null) !== (city.zone ?? null) ||
      (price === '' ? null : Number(price)) !== city.deliveryPrice,
    [zone, price, city.zone, city.deliveryPrice],
  );

  const save = async () => {
    setSaving(true);
    try {
      await coliixApi.updateCity(city.id, {
        zone: zone.trim() || null,
        deliveryPrice: price === '' ? null : Number(price),
      });
      toast({ kind: 'success', title: t('coliix.cities.saved') });
      onChanged();
    } catch {
      toast({ kind: 'error', title: t('coliix.cities.saveFail') });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('coliix.cities.confirmDelete', { city: city.ville }))) return;
    try {
      await coliixApi.deleteCity(city.id);
      onChanged();
    } catch {
      toast({ kind: 'error', title: t('coliix.cities.saveFail') });
    }
  };

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-1.5 font-semibold text-gray-800">{city.ville}</td>
      <td className="px-4 py-1.5">
        <input
          type="text"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder="—"
          className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-gray-200 focus:border-primary focus:outline-none"
        />
      </td>
      <td className="px-4 py-1.5 text-right">
        <input
          type="number"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs hover:border-gray-200 focus:border-primary focus:outline-none"
        />
        <span className="ml-1 text-[10px] text-gray-400">MAD</span>
      </td>
      <td className="px-4 py-1.5">
        <div className="flex justify-end gap-1">
          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
              title={t('common.save') as string}
            >
              <Save size={12} />
            </button>
          )}
          <button
            onClick={remove}
            className="rounded p-1 text-red-500 hover:bg-red-50"
            title={t('common.delete') as string}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Import summary banner (shows skipped rows after CSV upload) ────────────

function ImportSummaryBanner({
  summary,
  onDismiss,
}: {
  summary: ImportCitiesSummary;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-emerald-800">
            {t('coliix.cities.importTitle')}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {t('coliix.cities.importBody', {
              imported: summary.imported,
              unchanged: summary.unchanged,
              removed: summary.removed,
            })}
          </p>
        </div>
        <button onClick={onDismiss} className="text-xs text-emerald-700 hover:underline">
          {t('common.dismiss')}
        </button>
      </div>
      {summary.skipped.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <AlertCircle size={12} />
            {t('coliix.cities.skippedTitle', { count: summary.skipped.length })}
          </p>
          <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-amber-700">
            {summary.skipped.map((s, i) => (
              <li key={i}>
                <span className="font-mono">L{s.lineNo}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
