type Variant = 'primary' | 'off' | 'danger';
type Size = 'auto' | 'comfortable' | 'compact';

interface Props {
  label: string;
  active?: boolean;
  variant?: Variant;
  disabled?: boolean;
  onClick?: () => void;
  /**
   * Optional sizing. 'auto' (default) reproduces the original responsive
   * sizing: 48px on very narrow phones, 56px on phones, 52px from sm.
   * Every size keeps a tap target of at least 48px.
   */
  size?: Size;
  children: React.ReactNode;
}

const SIZE_CLASS: Record<Size, string> = {
  auto: 'h-12 w-12 min-[380px]:h-14 min-[380px]:w-14 sm:h-[52px] sm:w-[52px]',
  comfortable: 'h-14 w-14',
  compact: 'h-12 w-12',
};

/**
 * Single control family — every primary control uses this.
 * Dimensions, radius, icon sizing, hover/press/focus are identical
 * so the four buttons feel like one instrument.
 *
 * Phase 2A: calm graphite keys on a titanium hairline. Blue is reserved for an
 * engaged mode (`active` — markup armed) and red for the destructive action, so
 * the video stays the brightest thing on screen.
 */
export default function ControlButton({
  label,
  variant = 'primary',
  active,
  disabled,
  onClick,
  size = 'auto',
  children,
}: Props) {
  const isOff = variant === 'off';
  const isDanger = variant === 'danger';
  const isArmed = !isDanger && !isOff && active === true;

  const base = [
    'relative inline-flex shrink-0 select-none items-center justify-center rounded-2xl',
    'transition-[background-color,color,transform] duration-150 ease-out',
    'active:scale-[0.96] motion-reduce:transition-none motion-reduce:transform-none',
    // Visible keyboard focus that reads on graphite (never relies on hover).
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
    'disabled:cursor-not-allowed disabled:opacity-45',
    SIZE_CLASS[size],
  ].join(' ');

  // primary → neutral "key that is live"; off → dimmed + corner dot;
  // armed → the single blue accent; danger → destructive red.
  const cls = isDanger
    ? 'border border-status-danger/60 bg-status-danger text-white shadow-jc-float hover:brightness-110'
    : isOff
      ? 'border border-white/[0.07] bg-graphite-800 text-titanium-400 shadow-jc-inset-hairline hover:bg-graphite-700 hover:text-titanium-300'
      : isArmed
        ? 'border border-accent-500 bg-accent-500 text-white shadow-jc-float hover:bg-accent-600'
        : 'border border-white/[0.10] bg-graphite-700 text-titanium-100 shadow-jc-inset-hairline hover:bg-graphite-600';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active === undefined ? undefined : active}
      className={`${base} ${cls}`}
    >
      <span className="flex items-center justify-center [&_svg]:h-[22px] [&_svg]:w-[22px] sm:[&_svg]:h-[20px] sm:[&_svg]:w-[20px]">
        {children}
      </span>
      {isOff && (
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-white ring-2 ring-graphite-950" aria-hidden />
      )}
    </button>
  );
}
