import { ReactNode } from 'react';
import { IconLogo } from '../Icon';

type StatusTone = 'live' | 'connecting' | 'waiting' | 'error';

interface Props {
  code: string;
  connectionLabel: string;
  onLeave?: () => void;
  /**
   * Truthful tone for the connection indicator.
   *
   * Deliberately decoupled from `connectionLabel`: pass 'live' only when the
   * media session is actually connected (live remote stream / connected peer
   * connection) — never for signaling subscription alone. When omitted the dot
   * stays neutral instead of claiming a connected session, so this component
   * can never show a green "connected" dot that the session data doesn't
   * support.
   */
  status?: StatusTone;
  /**
   * Optional trailing action slot (e.g. a quick invite). Rendered inside the
   * pointer-events layer, so a passed control must be at least 48px to satisfy
   * the workspace tap-target rule.
   */
  action?: ReactNode;
}

const TONE_CLASS: Record<StatusTone, string> = {
  live: 'bg-status-success',
  connecting: 'bg-status-warn',
  waiting: 'bg-titanium-500',
  error: 'bg-status-danger',
};

export default function TopBar({ code, connectionLabel, status = 'waiting', action }: Props) {
  const dot = TONE_CLASS[status];
  const isError = status === 'error';

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-3 pt-[max(10px,env(safe-area-inset-top))] sm:px-4 sm:pt-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full jc-surface jc-blur jend-shadow px-2 py-1.5 sm:px-3 sm:py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-accent-500 text-white">
          <IconLogo size={16} />
        </span>
        <span className="hidden text-xs font-semibold tracking-tight text-titanium-100 sm:inline">JendCore</span>
        <span className="jc-hairline-v hidden h-4 shrink-0 sm:inline-block" aria-hidden />
        <span className="min-w-0 truncate font-mono text-xs font-semibold tracking-widest text-titanium-100">{code}</span>
        <span
          role="status"
          aria-live="polite"
          className={
            'ml-1 hidden items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold sm:inline-flex ' +
            (isError ? 'text-status-danger' : 'text-titanium-200')
          }
        >
          <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + dot} aria-hidden />
          {connectionLabel}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {action ? <div className="pointer-events-auto">{action}</div> : null}
        {/* Mobile-only connection pill — the only status readout below sm. */}
        <div
          role="status"
          aria-live="polite"
          className={
            'pointer-events-auto inline-flex items-center gap-1.5 rounded-full jc-surface jc-blur px-2.5 py-1 text-[11px] font-medium sm:hidden ' +
            (isError ? 'text-status-danger' : 'text-titanium-200')
          }
        >
          <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + dot} aria-hidden />
          {connectionLabel}
        </div>
      </div>
    </header>
  );
}
