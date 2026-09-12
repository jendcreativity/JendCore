import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  corner?: ReactNode;
  topBar?: ReactNode;
  toolbar?: ReactNode;
  bottomInsetClass?: string;
}

/**
 * Workspace shell — the video area stays free and dominates the screen.
 * Corner PiP never covers the center; controls float above with safe-area.
 */
export default function Stage({ children, corner, topBar, toolbar }: Props) {
  return (
    <div className="relative flex h-full min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-black">
      <div className="relative flex h-full w-full items-center justify-center">
        {children}
        {topBar}
        {toolbar}
        {corner && (
          <div className="pointer-events-none absolute bottom-[88px] right-3 z-20 sm:bottom-auto sm:right-4 sm:top-[64px]">
            <div className="pointer-events-auto w-[112px] sm:w-[148px] md:w-[176px] aspect-[4/3] overflow-hidden rounded-2xl border border-white/15 bg-black shadow-xl">
              {corner}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
