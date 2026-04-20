const BACKEND_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// Prepends the backend origin when the URL is a server-relative upload path.
// External URLs (http/https) and empty values pass through unchanged.
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/uploads/')) return `${BACKEND_ORIGIN}${url}`;
  return url;
}
