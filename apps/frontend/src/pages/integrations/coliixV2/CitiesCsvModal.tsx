/**
 * CSV import for V2 cities. Mirrors the V1 settings/CitiesTab UX so admins
 * have one mental model. Header order: ville,price,zone (V1 used name,price,zone
 * — synonyms accepted on parse).
 *
 * Two-stage flow:
 *   1. Pick file → parse client-side → preview rows + errors
 *   2. Pick mode (upsert / replace) → submit → show summary
 */

import { useRef, useState } from 'react';
import { Upload, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { GlassModal } from '@/components/ui/GlassModal';
import { coliixV2Api } from '@/services/coliixV2Api';
import { apiErrorMessage } from '@/lib/apiError';

interface ParsedRow {
  ville: string;
  zone: string | null;
  deliveryPrice: number | null;
}

interface ImportResult {
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
  skipped: Array<{ ville: string; reason: string }>;
}

interface Props {
  open: boolean;
  accountId: string | null;
  onClose: () => void;
  onComplete?: (r: ImportResult) => void;
}

// ── CSV parser — handles quoted fields, commas/semicolons/tabs as separators
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

// Map raw CSV → typed rows + collect issues. Detects header by checking
// whether the first cell of row 0 is a number (no header) or text (header).
// Recognised aliases for column 0: ville | name | city.
function parseCityCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (grid.length === 0) return { rows: [], errors: ['CSV is empty.'] };

  // Header detection — if col 0 of row 0 is non-numeric AND col 1 ≈ a number
  // header (e.g. "price"), treat as header.
  const firstRowFirstCol = grid[0][0]?.trim() ?? '';
  const looksLikeNumberCell = !Number.isNaN(Number(firstRowFirstCol.replace(',', '.')));
  const hasHeader = !looksLikeNumberCell;
  const dataRows = hasHeader ? grid.slice(1) : grid;

  // Determine column order from header (if present). Defaults: ville,price,zone.
  let villeIdx = 0;
  let priceIdx = 1;
  let zoneIdx = 2;
  if (hasHeader) {
    grid[0].forEach((h, i) => {
      const k = h.trim().toLowerCase();
      if (['ville', 'name', 'city'].includes(k)) villeIdx = i;
      else if (['price', 'deliveryprice', 'delivery_price', 'prix'].includes(k)) priceIdx = i;
      else if (['zone', 'region'].includes(k)) zoneIdx = i;
    });
  }

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  dataRows.forEach((cols, idx) => {
    const lineNo = idx + (hasHeader ? 2 : 1);
    const ville = (cols[villeIdx] ?? '').trim();
    if (!ville) {
      errors.push(`Line ${lineNo}: missing ville.`);
      return;
    }
    const priceStr = (cols[priceIdx] ?? '').trim().replace(',', '.');
    let price: number | null = null;
    if (priceStr) {
      const p = Number(priceStr);
      if (!Number.isFinite(p) || p < 0) {
        errors.push(`Line ${lineNo}: invalid price "${priceStr}".`);
        return;
      }
      price = p;
    }
    const zone = (cols[zoneIdx] ?? '').trim() || null;
    rows.push({ ville, zone, deliveryPrice: price });
  });
  return { rows, errors };
}

export function CitiesCsvModal({ open, accountId, onClose, onComplete }: Props) {
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<'upsert' | 'replace'>('upsert');
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setParsed([]);
    setErrors([]);
    setResult(null);
    setSubmitErr(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { rows, errors } = parseCityCsv(text);
    setParsed(rows);
    setErrors(errors);
    setResult(null);
  }

  async function handleSubmit() {
    if (!accountId || parsed.length === 0) return;
    setBusy(true);
    setSubmitErr(null);
    try {
      const r = await coliixV2Api.importCitiesCsv(accountId, parsed, mode);
      setResult(r);
      onComplete?.(r);
    } catch (err) {
      setSubmitErr(apiErrorMessage(err, 'Import failed'));
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadTemplate() {
    const csv = 'ville,price,zone\nCasablanca,25,Centre\nRabat,30,Nord\nAgadir,35,Sud\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coliix_v2_cities_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <GlassModal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import cities from CSV"
      size="2xl"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <p className="font-medium">CSV format</p>
          <p className="mt-1">
            Columns: <code className="rounded bg-white px-1">ville</code>,{' '}
            <code className="rounded bg-white px-1">price</code>,{' '}
            <code className="rounded bg-white px-1">zone</code> (header optional). Comma,
            semicolon, or tab separators all accepted.
          </p>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
          >
            <Download className="h-3.5 w-3.5" /> Download template
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">CSV file</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="block w-full rounded-md border border-gray-200 bg-white text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-primary-dark"
            />
          </div>
        </div>

        {errors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" /> {errors.length} row(s) skipped
            </div>
            <ul className="list-inside list-disc">
              {errors.slice(0, 8).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {errors.length > 8 && <li>… and {errors.length - 8} more</li>}
            </ul>
          </div>
        )}

        {parsed.length > 0 && !result && (
          <>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <div className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-4 w-4" /> {parsed.length} row(s) ready to import
              </div>
            </div>
            <div className="max-h-48 overflow-auto rounded-md border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-600">
                    <th className="px-2 py-1">Ville</th>
                    <th className="px-2 py-1">Zone</th>
                    <th className="px-2 py-1 text-right">Price (MAD)</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1">{r.ville}</td>
                      <td className="px-2 py-1 text-gray-600">{r.zone ?? '—'}</td>
                      <td className="px-2 py-1 text-right">
                        {r.deliveryPrice != null ? r.deliveryPrice.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                  {parsed.length > 50 && (
                    <tr>
                      <td colSpan={3} className="px-2 py-1 text-center text-gray-400">
                        … and {parsed.length - 50} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Import mode</label>
              <div className="mt-1 flex gap-3 text-sm">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    checked={mode === 'upsert'}
                    onChange={() => setMode('upsert')}
                  />
                  <span>Upsert — add/update only (safe)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    checked={mode === 'replace'}
                    onChange={() => setMode('replace')}
                  />
                  <span className="text-amber-700">Replace — delete villes not in file</span>
                </label>
              </div>
            </div>
          </>
        )}

        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <div className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Import complete
            </div>
            <ul className="mt-1 text-xs">
              <li>{result.inserted} added</li>
              <li>{result.updated} updated</li>
              <li>{result.unchanged} unchanged</li>
              {result.removed > 0 && <li>{result.removed} removed</li>}
              {result.skipped.length > 0 && <li>{result.skipped.length} skipped (errors)</li>}
            </ul>
          </div>
        )}

        {submitErr && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitErr}</div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <CRMButton
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Close
          </CRMButton>
          {parsed.length > 0 && !result && (
            <CRMButton
              onClick={handleSubmit}
              loading={busy}
              disabled={busy}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              Import {parsed.length} cities
            </CRMButton>
          )}
        </div>
      </div>
    </GlassModal>
  );
}
