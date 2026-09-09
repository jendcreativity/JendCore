import { IconClose } from './Icon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Collapsible side panel for mobile.
 * Slides in from the right on mobile, always visible on desktop.
 */
export default function SidePanel({ isOpen, onClose, children }: Props) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="sm:hidden fixed inset-0 bg-black/50 z-30"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel - mobile only; desktop uses dedicated sidebar in SessionPage */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-80 bg-ink-800 border-l border-ink-700 flex flex-col min-h-0 transition-transform duration-200 z-40 sm:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close button (mobile only) */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-ink-700 bg-ink-900">
          <h2 className="text-sm font-semibold text-white">Session</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-ink-700 rounded transition flex items-center gap-2"
            aria-label="Back to main screen"
          >
            <IconClose size={20} />
            <span className="text-xs">Back</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
