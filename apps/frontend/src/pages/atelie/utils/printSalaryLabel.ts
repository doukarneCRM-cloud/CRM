import type { TFunction } from 'i18next';
import type { SalaryRow } from '@/services/atelieApi';
import { formatWeekRange } from './weekMath';

/**
 * Open a 100×100mm printable label in a popup window so the operator can
 * stick it onto the pay envelope. Black-and-white only — no coloured
 * fills or accents — so the label prints crisply on monochrome
 * thermal printers and stays legible after a few weeks taped to a
 * cardboard envelope.
 *
 * Layout fills the full 100×100mm page: large name + meta header, the
 * note (if any) sits directly under the meta (not pushed to the
 * bottom), then the breakdown table, with a double-ruled TOTAL row at
 * the bottom that's the largest thing on the label.
 *
 * Two flavours:
 *  - `printSalaryLabel(row, ...)` prints one label.
 *  - `printAllSalaryLabels(rows, ...)` prints every row in the same
 *    print job — each label gets its own 100×100mm page via
 *    `page-break-after: always`, so a thermal printer feeds one
 *    envelope-sized label per employee without manual intervention.
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
    }
    return c;
  });
}

// Strictly black-and-white. The whole page is one solid `flex` column
// scaled to fill 100×100mm — every section sized so the total row
// lands snug against the bottom edge without leaving whitespace.
const LABEL_STYLES = `
  @page { size: 100mm 100mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #000;
    background: #fff;
  }
  .label {
    width: 100mm;
    height: 100mm;
    padding: 5mm 5.5mm;
    display: flex;
    flex-direction: column;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
    color: #000;
    background: #fff;
  }
  .label:last-child { page-break-after: auto; break-after: auto; }

  /* Header */
  .name {
    font-size: 18pt;
    font-weight: 900;
    line-height: 1.05;
    text-transform: uppercase;
    letter-spacing: 0.4pt;
    color: #000;
  }
  .meta {
    margin-top: 1mm;
    font-size: 9pt;
    color: #000;
    line-height: 1.2;
    padding-bottom: 2mm;
    border-bottom: 0.35mm solid #000;
  }

  /* Note — directly under the header so it's the first thing the
     employee reads, not buried at the bottom. */
  .note {
    margin-top: 2.5mm;
    margin-bottom: 1mm;
    font-size: 9pt;
    color: #000;
    line-height: 1.3;
    font-style: italic;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .note strong { font-style: normal; font-weight: 700; }

  /* Breakdown table */
  table {
    margin-top: 3mm;
    border-collapse: collapse;
    width: 100%;
    font-size: 11pt;
    color: #000;
  }
  th, td {
    padding: 1.8mm 1.5mm;
    text-align: left;
    border-bottom: 0.25mm solid #000;
    color: #000;
  }
  th {
    font-weight: 600;
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.2pt;
    width: 50%;
  }
  td { font-weight: 700; text-align: right; }

  /* Total — biggest, double-ruled, anchored to the bottom edge. */
  tr.total th, tr.total td {
    font-size: 15pt;
    font-weight: 900;
    border-top: 0.6mm double #000;
    border-bottom: none;
    padding-top: 3mm;
  }
`;

function buildLabelHtml(row: SalaryRow, weekStartISO: string, t: TFunction): string {
  const supplementHours = row.supplementHours || 0;
  const supplementHourRate = row.supplementHourRate || 0;
  const supplementPay = supplementHours * supplementHourRate;
  const total = row.amount + (row.commission || 0) + supplementPay;
  const week = formatWeekRange(weekStartISO);
  const note = row.notes && row.notes.trim().length > 0 ? row.notes.trim() : '';

  const supplementCell =
    supplementHourRate > 0 && supplementHours > 0
      ? `${supplementHours} × ${supplementHourRate.toFixed(0)} = ${supplementPay.toFixed(0)} MAD`
      : `${supplementHours}`;

  return `
  <div class="label">
    <div class="name">${escapeHtml(row.employee.name)}</div>
    <div class="meta">${escapeHtml(row.employee.role)} · ${escapeHtml(week)}</div>
    ${
      note
        ? `<div class="note"><strong>${escapeHtml(t('atelie.salary.note'))}:</strong> ${escapeHtml(note)}</div>`
        : ''
    }
    <table>
      <tr>
        <th>${escapeHtml(t('atelie.salary.daysWorked'))}</th>
        <td>${row.daysWorked}</td>
      </tr>
      <tr>
        <th>${escapeHtml(t('atelie.salary.baseAmount'))}</th>
        <td>${row.amount.toFixed(0)} MAD</td>
      </tr>
      <tr>
        <th>${escapeHtml(t('atelie.salary.commission'))}</th>
        <td>${(row.commission || 0).toFixed(0)} MAD</td>
      </tr>
      <tr>
        <th>${escapeHtml(t('atelie.salary.supplementHours'))}</th>
        <td>${escapeHtml(supplementCell)}</td>
      </tr>
      <tr class="total">
        <th>${escapeHtml(t('atelie.salary.totalDue'))}</th>
        <td>${total.toFixed(0)} MAD</td>
      </tr>
    </table>
  </div>`;
}

function openPrintWindow(title: string, bodyHtml: string): void {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${LABEL_STYLES}</style>
</head>
<body>
${bodyHtml}
<script>
  window.addEventListener('load', function () {
    setTimeout(function () {
      window.focus();
      window.print();
    }, 100);
  });
  window.addEventListener('afterprint', function () {
    window.close();
  });
</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=420,height=480');
  if (!win) {
    // Popup blocked — fall back to a Blob URL the user can open in a new tab.
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printSalaryLabel(
  row: SalaryRow,
  weekStartISO: string,
  t: TFunction,
): void {
  const week = formatWeekRange(weekStartISO);
  openPrintWindow(
    `${row.employee.name} — ${week}`,
    buildLabelHtml(row, weekStartISO, t),
  );
}

export function printAllSalaryLabels(
  rows: SalaryRow[],
  weekStartISO: string,
  t: TFunction,
): void {
  if (rows.length === 0) return;
  const week = formatWeekRange(weekStartISO);
  const body = rows.map((r) => buildLabelHtml(r, weekStartISO, t)).join('\n');
  openPrintWindow(`${t('atelie.salary.printAllTitle')} — ${week}`, body);
}
