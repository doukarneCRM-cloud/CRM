/** Monday 00:00 UTC of the week containing `ref`. */
export function mondayOfWeekUTC(ref: Date = new Date()): Date {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

export function addWeeks(ref: Date, n: number): Date {
  const d = new Date(ref);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d;
}

export function formatWeekRange(weekStartISO: string): string {
  const s = new Date(weekStartISO);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(s)} – ${fmt(e)}`;
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
