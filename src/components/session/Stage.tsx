import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  corner?: ReactNode;
  topBar?: ReactNode;
  toolbar?: ReactNode;
  bottomInsetClass?: string;
  /**
   * Optional positioning overrides for the corner PiP wrapper. Defaults to the
   * original placement, so existing callers keep the exact same layout.
   *
   * Only the PiP moves: the annotation overlay is a sibling inside the stage
   * box and its coordinate area is never resized by this prop.
   */
  cornerClass?: string;
}

/**
 * Workspace shell — the video area stays free and dominates the screen.
 * Corner PiP never covers the center; controls float above with safe-area.
 *
 * The inner box (`relative flex h-full w-full`) is the coordinate space the
 * AnnotationCanvas normalises against — it must stay untouched, so all Phase 2A
 * work happens on this outer surface and on the PiP wrapper.
 */
export default function Stage({ children, corner, topBar, toolbar, cornerClass }: Props) {
  return (
    <div className="relative flex h-full min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-graphite-950">
      <div className="relative flex h-full w-full items-center justify-center">
        {children}
        {topBar}
        {toolbar}
        {corner && (
          <div
            className={
              'pointer-events-none absolute z-20 ' +
              (cornerClass ?? 'bottom-[88px] right-3 sm:bottom-auto sm:right-4 sm:top-[64px]')
            }
          >
            <div className="pointer-events-auto aspect-[4/3] w-[104px] min-[380px]:w-[112px] overflow-hidden rounded-2xl border border-white/[0.12] bg-graphite-900 shadow-jc-float sm:w-[152px] md:w-[184px]">
              {corner}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
