import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CRMButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantMap = {
  // Primary action — lavender brand gradient with a soft elevated shadow.
  // Picks the brand colour from the new tone palette so primary CTAs pop
  // off the white-glass cards consistently across every page.
  primary:
    'bg-gradient-to-br from-tone-lavender-500 to-[#5E3FE6] text-white hover:brightness-110 active:scale-[0.97] shadow-[0_4px_14px_rgba(124,92,255,0.35)] hover:shadow-[0_6px_18px_rgba(124,92,255,0.45)] disabled:bg-gray-300 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none',
  // Secondary — subtle outlined chip on white that lifts on hover.
  secondary:
    'border border-gray-200 bg-white text-gray-700 hover:border-tone-lavender-300 hover:text-tone-lavender-500 active:scale-[0.97] disabled:border-gray-100 disabled:text-gray-400',
  // Ghost — text-only, picks lavender on hover so it feels brand-coherent.
  ghost:
    'text-gray-600 hover:bg-tone-lavender-50 hover:text-tone-lavender-500 active:scale-[0.97] bg-transparent disabled:text-gray-400',
  danger:
    'bg-tone-rose-500 text-white hover:brightness-110 active:scale-[0.97] shadow-[0_4px_14px_rgba(242,82,120,0.35)] disabled:bg-gray-300',
};

const sizeMap = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
};

const CRMButton = forwardRef<HTMLButtonElement, CRMButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center rounded-btn font-semibold transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          variantMap[variant],
          sizeMap[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 size={size === 'lg' ? 18 : 14} className="animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);

CRMButton.displayName = 'CRMButton';

export { CRMButton };
