import { useState } from 'react';
import { IconX } from './Icon';

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

      {/* Panel */}
      <div
        className={`fixed sm:static right-0 top-0 bottom-0 w-80 sm:w-96 bg-ink-800 border-l border-ink-700 flex flex-col min-h-0 transition-transform duration-200 z-40 sm:z-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full sm:translate-x-0'
        }`}
      >
        {/* Close button (mobile only) */}
        <div className="sm:hidden flex items-center justify-between px-3 py-2 border-b border-ink-700 bg-ink-900">
          <h2 className="text-sm font-semibold text-white">Controls</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-ink-700 rounded transition"
            aria-label="Close panel"
          >
            <IconX size={20} />
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
