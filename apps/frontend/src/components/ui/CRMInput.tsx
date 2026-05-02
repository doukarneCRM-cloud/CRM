import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface CRMInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  wrapperClassName?: string;
}

const CRMInput = forwardRef<HTMLInputElement, CRMInputProps>(
  (
    { label, error, hint, leftIcon, rightElement, wrapperClassName, className, id, ...props },
    ref,
  ) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
            {label}
            {props.required && <span className="ml-1 text-red-500">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 text-gray-400">{leftIcon}</span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-input border bg-white py-2.5 text-sm text-gray-900 placeholder-gray-400',
              'transition-all duration-150',
              // Brand-coloured focus ring + lavender border so inputs match
              // the rest of the lavender-accent UI surface.
              'focus:outline-none focus:ring-2 focus:ring-tone-lavender-100 focus:border-tone-lavender-300',
              'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
              leftIcon ? 'pl-10 pr-4' : 'px-4',
              rightElement ? 'pr-10' : '',
              error
                ? 'border-tone-rose-300 focus:border-tone-rose-300 focus:ring-tone-rose-100'
                : 'border-gray-200',
              className,
            )}
            {...props}
          />

          {rightElement && (
            <span className="absolute right-3 text-gray-400">{rightElement}</span>
          )}
        </div>

        {error && <p className="text-xs font-medium text-tone-rose-500">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
    );
  },
);

CRMInput.displayName = 'CRMInput';

export { CRMInput };
