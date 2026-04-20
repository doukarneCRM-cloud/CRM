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
  primary:
    'bg-primary text-white hover:bg-primary-dark active:scale-95 shadow-sm disabled:bg-gray-300',
  secondary:
    'border border-primary text-primary hover:bg-accent active:scale-95 bg-transparent disabled:border-gray-200 disabled:text-gray-400',
  ghost:
    'text-primary hover:bg-accent active:scale-95 bg-transparent disabled:text-gray-400',
  danger:
    'bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-sm disabled:bg-gray-300',
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
