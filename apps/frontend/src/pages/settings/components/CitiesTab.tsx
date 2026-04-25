import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Upload, MapPin, Search, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { citiesApi, type City, type ImportResponse } from '@/services/citiesApi';
import type { TFunction } from 'i18next';

// ─── CSV helpers ─────────────────────────────────────────────────────────────
// Minimal CSV parser — handles quoted fields + commas inside quotes. We roll
// our own rather than pulling in a dep since the file is user-provided and we
// want precise error messages.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';' || ch === '\t') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (field.length > 0 || row.length > 0) {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

interface ParsedRow {
  name: string;
  price: number;
  zone: string | null;
}

function parseCityCsv(text: string, t: TFunction): { rows: ParsedRow[]; errors: string[] } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (rows.length === 0) return { rows: [], errors: [t('settings.cities.errors.csvEmpty')] };

  // Detect header — if the first cell of row 0 is not a number-looking string
  // we treat row 0 as a header.
  const firstPrice = Number(rows[0][1]);
  const hasHeader = Number.isNaN(firstPrice);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const parsed: ParsedRow[] = [];
  const errors: string[] = [];
  dataRows.forEach((cols, idx) => {
    const lineNo = idx + (hasHeader ? 2 : 1);
    const name = (cols[0] ?? '').trim();
    const priceStr = (cols[1] ?? '').trim().replace(',', '.');
    const zone = (cols[2] ?? '').trim() || null;
    if (!name) {
      errors.push(t('settings.cities.errors.lineMissingName', { line: lineNo }));
      return;
    }
    const price = Number(priceStr);
    if (!Number.isFinite(price) || price < 0) {
      errors.push(t('settings.cities.errors.lineInvalidPrice', { line: lineNo, price: priceStr }));
      return;
    }
    parsed.push({ name, price, zone });
  });
  return { rows: parsed, errors };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CitiesTab() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit = hasPermission(PERMISSIONS.SETTINGS_EDIT);

  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Add-city row
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newZone, setNewZone] = useState('');
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [edit, setEdit] = useState<Record<string, { price: string; zone: string }>>({});

  // CSV import
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'upsert' | 'replace'>('upsert');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await citiesApi.list(false);
      setCities(data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? t('settings.cities.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.zone ?? '').toLowerCase().includes(q),
    );
  }, [cities, search]);

  const activeCount = useMemo(() => cities.filter((c) => c.isActive).length, [cities]);

  // ── Add ────────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!canEdit) return;
    const name = newName.trim();
    const price = Number(newPrice);
    if (!name || !Number.isFinite(price) || price < 0) {
      setError(t('settings.cities.errors.addInvalid'));
      return;
    }
    setAdding(true);
    try {
      const created = await citiesApi.create({
        name,
        price,
        zone: newZone.trim() || null,
      });
      setCities((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setNewPrice('');
      setNewZone('');
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? t('settings.cities.errors.addFailed'));
    } finally {
      setAdding(false);
    }
  };

  // ── Inline edit ────────────────────────────────────────────────────────────
  const startEdit = (c: City) => {
    setEdit((p) => ({ ...p, [c.id]: { price: String(c.price), zone: c.zone ?? '' } }));
  };
  const cancelEdit = (id: string) => {
    setEdit((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  };
  const saveEdit = async (c: City) => {
    const draft = edit[c.id];
    if (!draft) return;
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price < 0) {
      setError(t('settings.cities.errors.editInvalid', { name: c.name }));
      return;
    }
    try {
      const updated = await citiesApi.update(c.id, { price, zone: draft.zone.trim() || null });
      setCities((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
      cancelEdit(c.id);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? t('settings.cities.errors.saveFailed'));
    }
  };

  const toggleActive = async (c: City) => {
    try {
      const updated = await citiesApi.update(c.id, { isActive: !c.isActive });
      setCities((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? t('settings.cities.errors.toggleFailed'));
    }
  };

  const remove = async (c: City) => {
    if (!confirm(t('settings.cities.deleteConfirm', { name: c.name }))) return;
    try {
      await citiesApi.remove(c.id);
      setCities((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? t('settings.cities.errors.deleteFailed'));
    }
  };

  // ── CSV ────────────────────────────────────────────────────────────────────
  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCsvErrors([]);
    setImportResult(null);
    try {
      const text = await file.text();
      const { rows, errors } = parseCityCsv(text, t);
      if (errors.length > 0) {
        setCsvErrors(errors);
      }
      if (rows.length === 0) {
        setError(t('settings.cities.errors.noValidRows'));
        return;
      }
      setImporting(true);
      const result = await citiesApi.importCsv(rows, importMode);
      setImportResult(result);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? err?.message ?? t('settings.cities.errors.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'name,price,zone\nCasablanca,25,Centre\nRabat,30,Nord\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cities_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400">
            {t('settings.cities.summary', { count: cities.length, active: activeCount })}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <CRMButton variant="ghost" size="sm" leftIcon={<Download size={13} />} onClick={downloadTemplate}>
              {t('settings.cities.template')}
            </CRMButton>
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as 'upsert' | 'replace')}
              className="h-8 rounded-input border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              title={t('settings.cities.importTitle')}
            >
              <option value="upsert">{t('settings.cities.modeUpsert')}</option>
              <option value="replace">{t('settings.cities.modeReplace')}</option>
            </select>
            <CRMButton
              variant="secondary"
              size="sm"
              leftIcon={importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              onClick={handleFilePick}
              disabled={importing}
            >
              {importing ? t('settings.cities.importing') : t('settings.cities.importCsv')}
            </CRMButton>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          <span className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> {error}
          </span>
          <button type="button" onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            ×
          </button>
        </div>
      )}

      {importResult && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={14} /> {t('settings.cities.importDone')}
            </span>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className="text-emerald-700/70 hover:text-emerald-900"
            >
              {t('settings.cities.dismiss')}
            </button>
          </div>
          <p className="mt-1 text-emerald-700">
            {t('settings.cities.importSummary', {
              created: importResult.summary.created,
              updated: importResult.summary.updated,
              unchanged: importResult.summary.unchanged,
              deactivatedTail:
                importResult.summary.deactivated > 0
                  ? t('settings.cities.deactivatedTail', { count: importResult.summary.deactivated })
                  : '',
              skippedTail:
                importResult.summary.skipped > 0
                  ? t('settings.cities.skippedTail', { count: importResult.summary.skipped })
                  : '',
            })}
          </p>
        </div>
      )}

      {csvErrors.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <p className="mb-1 font-semibold">{t('settings.cities.csvIssuesTitle', { count: csvErrors.length })}</p>
          <ul className="ml-4 list-disc space-y-0.5">
            {csvErrors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {csvErrors.length > 8 && (
              <li>{t('settings.cities.csvIssuesMore', { count: csvErrors.length - 8 })}</li>
            )}
          </ul>
        </div>
      )}

      {/* Add row */}
      {canEdit && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
            <Plus size={14} className="text-primary" /> {t('settings.cities.addTitle')}
          </h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.5fr_1fr_1fr_auto]">
            <CRMInput
              placeholder={t('settings.cities.addNamePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={adding}
            />
            <CRMInput
              placeholder={t('settings.cities.addPricePlaceholder')}
              type="number"
              min={0}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              disabled={adding}
            />
            <CRMInput
              placeholder={t('settings.cities.addZonePlaceholder')}
              value={newZone}
              onChange={(e) => setNewZone(e.target.value)}
              disabled={adding}
            />
            <CRMButton variant="primary" onClick={handleAdd} disabled={adding}>
              {adding ? t('settings.cities.adding') : t('settings.cities.add')}
            </CRMButton>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={t('settings.cities.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-input border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">{t('settings.cities.columns.city')}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t('settings.cities.columns.price')}</th>
              <th className="px-4 py-2.5 text-left font-semibold">{t('settings.cities.columns.zone')}</th>
              <th className="px-4 py-2.5 text-center font-semibold">{t('settings.cities.columns.active')}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{canEdit ? t('settings.cities.columns.actions') : ''}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-xs text-gray-400">
                  {t('settings.cities.loading')}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-300">
                      <MapPin size={18} />
                    </div>
                    <p className="text-xs text-gray-400">
                      {cities.length === 0
                        ? t('settings.cities.emptyNoCities')
                        : t('settings.cities.emptyNoMatches')}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const draft = edit[c.id];
                const isEditing = Boolean(draft);
                return (
                  <tr
                    key={c.id}
                    className={`border-t border-gray-100 ${c.isActive ? '' : 'bg-gray-50/60 text-gray-400'}`}
                  >
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={draft.price}
                          onChange={(e) =>
                            setEdit((p) => ({ ...p, [c.id]: { ...p[c.id], price: e.target.value } }))
                          }
                          className="w-24 rounded-input border border-gray-200 bg-white px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => canEdit && startEdit(c)}
                          className={canEdit ? 'cursor-pointer hover:text-primary' : undefined}
                          title={canEdit ? t('settings.cities.clickToEdit') : undefined}
                        >
                          {c.price.toLocaleString('fr-MA')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <input
                          type="text"
                          value={draft.zone}
                          onChange={(e) =>
                            setEdit((p) => ({ ...p, [c.id]: { ...p[c.id], zone: e.target.value } }))
                          }
                          className="w-full rounded-input border border-gray-200 bg-white px-2 py-1 text-sm focus:border-primary focus:outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => canEdit && startEdit(c)}
                          className={canEdit ? 'cursor-pointer hover:text-primary' : undefined}
                        >
                          {c.zone || <span className="text-gray-300">—</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => canEdit && toggleActive(c)}
                        disabled={!canEdit}
                        className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          c.isActive ? 'bg-emerald-500' : 'bg-gray-300'
                        } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            c.isActive ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit && (
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <CRMButton variant="primary" size="sm" onClick={() => saveEdit(c)}>
                                {t('settings.cities.save')}
                              </CRMButton>
                              <CRMButton variant="ghost" size="sm" onClick={() => cancelEdit(c.id)}>
                                {t('settings.cities.cancel')}
                              </CRMButton>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => remove(c)}
                              title={t('settings.cities.deleteTitle')}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
