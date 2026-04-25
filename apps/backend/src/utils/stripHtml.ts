/**
 * Convert an HTML string into plain text suitable for storage and editing
 * in a textarea. Used on YouCan-imported product descriptions, which arrive
 * as marketing-grade HTML (`<p>`, `<strong>`, `&nbsp;`, inline imgs) and
 * would otherwise show up as raw markup in the edit modal.
 *
 * Block-level closing tags become newlines so paragraph structure survives.
 * Common named entities and numeric (&#1234; / &#x4f;) entities decode to
 * their characters. Whitespace is normalized so the result reads cleanly.
 *
 * Lightweight and dependency-free — adequate for descriptions; not a
 * general-purpose HTML sanitizer.
 */
export function stripHtml(html: string | null | undefined): string {
  if (html == null) return '';
  const s = String(html);
  if (s.length === 0) return '';

  return s
    // Block boundaries → newlines so paragraph/list structure survives.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    // Drop every remaining tag (<img>, <a>, <span>, opening <p>, etc.).
    .replace(/<[^>]+>/g, '')
    // Named entities common in YouCan content.
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    // Numeric entities — decimal then hex.
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    // Tidy whitespace: collapse runs of spaces/tabs, strip indentation
    // around newlines, cap consecutive blank lines at one.
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
