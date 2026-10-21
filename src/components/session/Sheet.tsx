import { ReactNode, useEffect, useRef } from 'react';
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
  /**
   * When false the panel body does not scroll; the caller's own content owns
   * its scrolling. The command panel uses this so chat keeps exactly one
   * scroller (its message list) and the tab panel supplies the scroller for the
   * content-style tabs (People).
   */
  scrollBody?: boolean;
  /**
   * When false the dialog keeps its accessible name but renders no visible
   * heading, for callers that supply their own title (the command panel's tab
   * bar). The Close key is always rendered.
   */
  showHeading?: boolean;
  children: ReactNode;
}

/**
 * Overlay container for the workspace panels (chat, markup, people, invite).
 *
 * Phase 2A: a solid graphite plate with a titanium hairline replaces the old
 * glassy surface, so a panel reads as an instrument floating above the video
 * instead of a transparent sheet. Escape and scrim-click still close, and
 * `role="dialog"`/`aria-modal`/`aria-label`, the scroll region and the focus
 * contract are all intact. `scrollBody` and `showHeading` let the command panel
 * own its own scrolling and supply its tab bar as the visible heading, so a
 * panel never ends up with nested scrollers or two competing titles. On phones
 * the sheet is measured in dynamic viewport units where they are supported, so
 * browser chrome cannot eat the composer.
 */
export default function Sheet({
  open,
  onClose,
  title,
  side = 'right',
  scrollBody = true,
  showHeading = true,
  children,
}: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /**
   * Focus contract: opening moves focus into the dialog — onto Close, never a
   * text field, so a phone does not pop the keyboard over the panel — and
   * closing hands focus back to the control the user came from. Keyed on
   * `open` alone so a parent re-render cannot yank focus back mid-typing.
   */
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      const previous = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open]);

  /**
   * Tab containment is handled on the dialog itself, so only the dialog that
   * currently holds focus cycles Tab (two stacked sheets never fight). Hidden
   * tabpanels are excluded because they have no layout box.
   */
  function onDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const outside = !active || !root.contains(active);
    if (e.shiftKey && (outside || active === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (outside || active === last)) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  const isRight = side === 'right';
  const isSheet = !isRight;

  // A right panel is a full-height overlay; a sheet hugs its content and keeps
  // the safe-area inset as padding so the last control is never under the bar.
  const panelClass = isRight
    ? 'flex h-full w-[92vw] max-w-[380px] flex-col jc-surface-raised shadow-jc-panel sm:w-[380px]'
    : side === 'bottom'
      ? 'absolute inset-x-0 bottom-0 flex max-h-[86vh] supports-[height:100dvh]:max-h-[86dvh] flex-col rounded-t-[20px] pb-[env(safe-area-inset-bottom)] jc-surface-raised shadow-jc-sheet'
      : 'absolute inset-x-0 bottom-0 flex max-h-[86vh] supports-[height:100dvh]:max-h-[86dvh] flex-col rounded-t-[20px] pb-[env(safe-area-inset-bottom)] jc-surface-raised shadow-jc-sheet sm:static sm:h-full sm:max-h-none sm:w-[380px] sm:rounded-none sm:pb-0 sm:shadow-jc-panel';

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onDialogKeyDown}
        className={panelClass}
      >
        {isSheet && <span className={handleClass} aria-hidden />}
        <div
          className={`flex shrink-0 items-center gap-3 px-4 py-2.5 ${showHeading ? 'justify-between' : 'justify-end'}`}
        >
          {showHeading ? (
            <h2 className="truncate text-sm font-semibold tracking-tight text-titanium-100">{title}</h2>
          ) : null}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] text-titanium-200 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:scale-[0.96] motion-reduce:transition-none motion-reduce:transform-none"
          >
            <IconClose size={18} />
          </button>
        </div>
        <span className="jc-hairline shrink-0" aria-hidden />
        <div
          className={
            scrollBody
              ? 'min-h-0 flex-1 overflow-y-auto scrollbar-thin'
              : 'min-h-0 flex-1 overflow-hidden'
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
