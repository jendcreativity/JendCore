import { ReactNode, useRef } from 'react';
import FloatingTile from './FloatingTile';

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
 * AnnotationCanvas normalises against — its classes are untouched (only a ref is
 * attached so the floating PiP can measure/clamp against it), so all Phase 2A
 * work happens on this outer surface and inside the FloatingTile wrapper.
 */
export default function Stage({ children, corner, topBar, toolbar, cornerClass }: Props) {
  const stageBoxRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="relative flex h-full min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-graphite-950">
      <div ref={stageBoxRef} className="relative flex h-full w-full items-center justify-center">
        {children}
        {topBar}
        {toolbar}
        {corner && (
          <FloatingTile boundsRef={stageBoxRef} anchorClass={cornerClass}>
            {corner}
          </FloatingTile>
        )}
      </div>
    </div>
  );
}
