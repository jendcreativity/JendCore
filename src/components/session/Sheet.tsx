import { ReactNode, useEffect } from 'react';
import { IconClose } from '../Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /**
   * 'right'  — full-height overlay panel on the right edge (default).
   * 'bottom' — bottom sheet that hugs its content.
   * 'auto'   — bottom sheet on phones, right panel from sm up. Pure CSS, so
   *            rotation and resize reflow without a JS listener.
   */
  side?: 'right' | 'bottom' | 'auto';
  children: ReactNode;
}

/**
 * Overlay container for the workspace panels (chat, markup, people, invite).
 *
 * Phase 2A: a solid graphite plate with a titanium hairline replaces the old
 * glassy surface, so a panel reads as an instrument floating above the video
 * instead of a transparent sheet. Behaviour is unchanged — Escape and
 * scrim-click still close, `role="dialog"`/`aria-modal`/`aria-label` and the
 * scrollable body are untouched; only the surface, the grab handle and the
 * close target (now a full 48px) changed.
 */
export default function Sheet({ open, onClose, title, side = 'right', children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isRight = side === 'right';
  const isSheet = !isRight;

  // A right panel is a full-height overlay; a sheet hugs its content and keeps
  // the safe-area inset as padding so the last control is never under the bar.
  const panelClass = isRight
    ? 'flex h-full w-[92vw] max-w-[380px] flex-col jc-surface-raised shadow-jc-panel sm:w-[380px]'
    : side === 'bottom'
      ? 'absolute inset-x-0 bottom-0 flex max-h-[78vh] flex-col rounded-t-[20px] pb-[env(safe-area-inset-bottom)] jc-surface-raised shadow-jc-sheet'
      : 'absolute inset-x-0 bottom-0 flex max-h-[78vh] flex-col rounded-t-[20px] pb-[env(safe-area-inset-bottom)] jc-surface-raised shadow-jc-sheet sm:static sm:h-full sm:max-h-none sm:w-[380px] sm:rounded-none sm:pb-0 sm:shadow-jc-panel';

  const handleClass =
    'mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/[0.18]' + (side === 'auto' ? ' sm:hidden' : '');

  return (
    <div className="fixed inset-0 z-40 flex">
      <button
        aria-label="Close panel"
        className="flex-1 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={panelClass}
      >
        {isSheet && <span className={handleClass} aria-hidden />}
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5">
          <h2 className="truncate text-sm font-semibold tracking-tight text-titanium-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] text-titanium-200 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:scale-[0.96] motion-reduce:transition-none motion-reduce:transform-none"
          >
            <IconClose size={18} />
          </button>
        </div>
        <span className="jc-hairline shrink-0" aria-hidden />
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  );
}
