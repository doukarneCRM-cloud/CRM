import { cn } from '@/lib/cn';

interface Props {
  className?: string;
}

/**
 * Anaqatoki wordmark — "ANAQATOKI - أناقتك".
 *
 * Rendered as styled inline text so it stays sharp at any size and picks
 * up color from the parent's `text-*` class. Latin half uses the page's
 * heaviest sans weight (`font-black`); the Arabic half falls back to
 * system Arabic fonts (Tahoma / Segoe UI / Arial) which every desktop
 * OS ships with — keeps the bundle free of webfont weight.
 *
 * Sizing is delegated to the parent via `className` (`text-sm`,
 * `text-base`, etc.). Replace this component if you ever ship a real
 * logo file — swap the markup for an `<img src={logo} />` and the
 * call-sites stay untouched.
 */
export function BrandLogo({ className }: Props) {
  return (
    <div
      className={cn(
        'flex items-center justify-start gap-1 text-primary',
        className,
      )}
      aria-label="ANAQATOKI - أناقتك"
    >
      <span className="font-black tracking-[-0.02em] leading-none">ANAQATOKI</span>
      <span className="font-black leading-none">-</span>
      <span
        className="font-bold leading-none"
        dir="rtl"
        style={{ fontFamily: '"Tahoma", "Segoe UI", "Arial", sans-serif' }}
      >
        أناقتك
      </span>
    </div>
  );
}
