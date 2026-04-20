function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const body = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
  return [headers.map(escapeCell).join(','), body].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel opens UTF-8 correctly (Arabic / accented city names stay legible).
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
