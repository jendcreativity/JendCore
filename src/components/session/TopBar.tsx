import { IconLogo } from '../Icon';

interface Props {
  code: string;
  connectionLabel: string;
  onLeave?: () => void;
}

export default function TopBar({ code, connectionLabel }: Props) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-3 pt-[max(10px,env(safe-area-inset-top))] sm:px-4 sm:pt-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full glass-panel jend-shadow px-2.5 py-1.5 sm:px-3 sm:py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-white">
          <IconLogo size={16} />
        </span>
        <span className="hidden sm:inline text-xs font-bold tracking-tight text-white">JendCore</span>
        <span className="hidden sm:inline h-4 w-px bg-white/15" aria-hidden />
        <span className="font-mono text-xs font-semibold tracking-widest text-white/90">{code}</span>
        <span
          className="ml-1 hidden sm:inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80"
          aria-live="polite"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          {connectionLabel}
        </span>
      </div>

      {/* Mobile-only connection pill when hidden in left cluster - keep minimal */}
      <div className="pointer-events-auto sm:hidden rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
        {connectionLabel}
      </div>
    </header>
  );
}
