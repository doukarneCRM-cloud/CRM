import type { TFunction } from 'i18next';
import type { SalaryRow } from '@/services/atelieApi';
import { formatWeekRange } from './weekMath';

/**
 * Open a 100×100mm printable label in a popup window so the operator can
 * stick it onto the pay envelope. The label is self-contained (inline
 * CSS, no JS, no fonts loaded from the network) so it prints reliably
 * even on slow thermal-label printers.
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

const LABEL_STYLES = `
  @page { size: 100mm 100mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .label {
    width: 100mm;
    height: 100mm;
    padding: 4mm 5mm;
    display: flex;
    flex-direction: column;
    gap: 2mm;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
  }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .name {
    font-size: 14pt;
    font-weight: 800;
    line-height: 1.1;
    text-transform: uppercase;
    letter-spacing: 0.3pt;
  }
  .meta {
    font-size: 8pt;
    color: #555;
    line-height: 1.2;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 9pt;
  }
  th, td {
    padding: 1.2mm 1.5mm;
    text-align: left;
    border-bottom: 0.3mm solid #ddd;
  }
  th {
    background: #f3f4f6;
    font-weight: 600;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.2pt;
    color: #555;
    width: 45%;
  }
  td { font-weight: 600; text-align: right; }
  tr.total th, tr.total td {
    font-size: 11pt;
    font-weight: 800;
    color: #111;
    background: #ede9fe;
    border-bottom: none;
  }
  .note {
    margin-top: auto;
    font-size: 8pt;
    color: #333;
    line-height: 1.25;
    border-top: 0.3mm dashed #999;
    padding-top: 1.5mm;
    word-break: break-word;
    overflow: hidden;
    max-height: 18mm;
  }
  .note strong { color: #555; font-weight: 600; }
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
    ${
      note
        ? `<div class="note"><strong>${escapeHtml(t('atelie.salary.note'))}:</strong> ${escapeHtml(note)}</div>`
        : ''
    }
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
