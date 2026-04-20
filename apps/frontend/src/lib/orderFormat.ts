export function formatRef(ref: string): { prefix: string; seq: string } {
  const parts = ref.split('-');
  return parts.length === 3
    ? { prefix: `${parts[0]}-${parts[1]}-`, seq: parts[2] }
    : { prefix: '', seq: ref };
}

export function formatDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const time = d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
