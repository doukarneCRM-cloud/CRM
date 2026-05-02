import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

export type GlassTone = 'lavender' | 'peach' | 'mint' | 'sky' | 'rose' | 'amber';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  lift?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  // When set, gives the card a subtle pastel gradient + tinted border so
  // KPI / category cards read as one coherent set on the dashboard. When
  // unset (default), the card stays neutral white-glass — the previous look.
  tone?: GlassTone;
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

// Tinted background gradient + border per tone. Mirrors the tailwind
// `colors.tone.<x>` palette so the rest of the card (icon bg, accent)
// composes against the same hues. Kept on the Tailwind side as inline
// arbitrary classes so we don't fight the JIT.
const toneClass: Record<GlassTone, string> = {
  lavender: 'bg-gradient-to-br from-tone-lavender-50 to-white border-tone-lavender-100',
  peach:    'bg-gradient-to-br from-tone-peach-50 to-white    border-tone-peach-100',
  mint:     'bg-gradient-to-br from-tone-mint-50 to-white     border-tone-mint-100',
  sky:      'bg-gradient-to-br from-tone-sky-50 to-white      border-tone-sky-100',
  rose:     'bg-gradient-to-br from-tone-rose-50 to-white     border-tone-rose-100',
  amber:    'bg-gradient-to-br from-tone-amber-50 to-white    border-tone-amber-100',
};

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, lift = false, padding = 'md', tone, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'glass',
          tone && toneClass[tone],
          lift && 'glass-lift cursor-pointer',
          paddingMap[padding],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

GlassCard.displayName = 'GlassCard';

export { GlassCard };
