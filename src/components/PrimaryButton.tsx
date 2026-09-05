import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-accent-500 hover:bg-accent-600 active:bg-accent-600 text-white shadow-lg shadow-accent-500/20',
  secondary:
    'bg-ink-700 hover:bg-ink-600 active:bg-ink-600 text-ink-50 border border-ink-600',
  ghost: 'bg-transparent hover:bg-ink-800 text-ink-100 border border-ink-700',
  danger: 'bg-red-500 hover:bg-red-600 active:bg-red-600 text-white',
};

const SIZE_CLASSES = {
  md: 'h-11 px-5 text-base',
  lg: 'h-14 px-7 text-lg',
};

/**
 * The single button component used throughout JendCore.
 *
 * Touch targets are always at least 44px tall (WCAG / Apple HIG).
 * Visual variants are intentionally limited to four.
 */
const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  function PrimaryButton(
    { variant = 'primary', size = 'md', fullWidth, className = '', children, ...rest },
    ref,
  ) {
    const classes = [
      'inline-flex items-center justify-center gap-2',
      'rounded-xl font-semibold transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      SIZE_CLASSES[size],
      VARIANT_CLASSES[variant],
      fullWidth ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} className={classes} {...rest}>
        {children}
      </button>
    );
  },
);

export default PrimaryButton;
