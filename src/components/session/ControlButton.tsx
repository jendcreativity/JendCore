type Variant = 'primary' | 'off' | 'danger';

interface Props {
  label: string;
  active?: boolean;
  variant?: Variant;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

/**
 * Single control family — every primary control uses this.
 * Dimensions, radius, icon sizing, hover/press/focus are identical
 * so the four buttons feel like one instrument.
 */
export default function ControlButton({
  label,
  variant = 'primary',
  active,
  disabled,
  onClick,
  children,
}: Props) {
  const isOff = variant === 'off';
  const isDanger = variant === 'danger';
  // isOff → neutral glass with strong icon change; primary blue is #1877F2
  const base =
    'relative inline-flex h-[56px] w-[56px] sm:h-[52px] sm:w-[52px] shrink-0 items-center justify-center rounded-[16px] text-white transition-all duration-150 ease-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1220] disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.96]';
  const cls = isDanger
    ? 'bg-[#DC2626] hover:bg-[#b91c1c] active:bg-[#991b1b] shadow-lg shadow-red-900/20'
    : isOff
      ? 'bg-white/[0.12] hover:bg-white/[0.18] border border-white/10 text-white'
      : active
        ? 'bg-[#1877F2] hover:bg-[#0F5FCC] active:bg-[#0d4fb3] shadow-lg shadow-blue-900/30'
        : 'bg-[#1877F2] hover:bg-[#0F5FCC] active:bg-[#0d4fb3] shadow-lg shadow-blue-900/30';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${cls}`}
    >
      <span className="flex items-center justify-center [&_svg]:h-[22px] [&_svg]:w-[22px] sm:[&_svg]:h-[20px] sm:[&_svg]:w-[20px]">
        {children}
      </span>
      {isOff && (
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-white ring-2 ring-[#0b1220]" aria-hidden />
      )}
    </button>
  );
}
