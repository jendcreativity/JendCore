import { ReactNode, useEffect } from 'react';
import { IconClose } from '../Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'right' | 'bottom';
  children: ReactNode;
}

export default function Sheet({ open, onClose, title, side = 'right', children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isRight = side === 'right';

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
        className={
          isRight
            ? 'flex h-full w-[92vw] max-w-[380px] flex-col bg-[#0b1220] border-l border-white/10 shadow-2xl sm:w-[380px]'
            : 'absolute inset-x-0 bottom-0 max-h-[78vh] flex flex-col rounded-t-[20px] bg-[#0b1220] border-t border-white/10 shadow-2xl'
        }
        style={isRight ? undefined : { paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-bold tracking-tight text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/15 transition"
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  );
}
