/**
 * Document toolbar — the controls for the shared-document workspace.
 *
 * One floating plate over the viewer: drawing tools, ink colours, undo / redo /
 * clear, page navigation and zoom. Rendered by `DocViewer`, which owns the zoom
 * state and feeds the numbers in here.
 *
 * The keys are the control-bar family: pill, titanium text, blue only while a
 * tool is armed. Compact at 40px so six tools, the palette and the navigation
 * cluster fit one plate at 320px width.
 */

import {
  IconArrow,
  IconChevronLeft,
  IconCircle,
  IconClose,
  IconEraser,
  IconFileText,
  IconFit,
  IconPen,
  IconRedo,
  IconResize,
  IconText,
  IconTrash,
  IconUndo,
} from '../Icon';
import { DOC_COLOR } from '../../lib/docAnnotations';
import type { DocPointerTool } from './DocAnnotationLayer';

/** The ink palette offered to document annotators. */
export const DOC_COLORS = [DOC_COLOR, '#f59e0b', '#22c55e', '#0ea5e9', '#a855f7', '#ffffff'];

interface Props {
  name: string;
  page: number;
  pageCount: number;
  tool: DocPointerTool | null;
  color: string;
  zoomPercent: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: DocPointerTool | null) => void;
  onColorChange: (color: string) => void;
  onPageChange: (page: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Hides the workspace overlay; the document stays shared. */
  onClose: () => void;
  /** Ends the shared document for everyone in the session. */
  onCloseDocument: () => void;
}

const TOOLS: { id: DocPointerTool; label: string }[] = [
  { id: 'pen', label: 'Pen' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'rect', label: 'Rect' },
  { id: 'circle', label: 'Circle' },
  { id: 'text', label: 'Text' },
  { id: 'erase', label: 'Erase' },
];

const KEY =
  'inline-flex h-10 min-w-[40px] shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ' +
  'transition-colors duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500';
const ICON_KEY = KEY + ' w-10 px-0';
const IDLE = 'bg-white/[0.06] text-titanium-200 hover:bg-white/[0.12] hover:text-white';
const ARMED = 'bg-accent-500 text-white hover:bg-accent-600';
const DISABLED =
  'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/[0.06] disabled:hover:text-titanium-200';

function ToolIcon(id: DocPointerTool) {
  switch (id) {
    case 'pen':
      return <IconPen size={18} />;
    case 'arrow':
      return <IconArrow size={18} />;
    case 'rect':
      return <IconResize size={18} />;
    case 'circle':
      return <IconCircle size={18} />;
    case 'text':
      return <IconText size={18} />;
    case 'erase':
      return <IconEraser size={18} />;
  }
}

export default function DocToolbar({
  name,
  page,
  pageCount,
  tool,
  color,
  zoomPercent,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onPageChange,
  onUndo,
  onRedo,
  onClearPage,
  onZoomIn,
  onZoomOut,
  onFit,
  onClose,
  onCloseDocument,
}: Props) {
  return (
    <div className="pointer-events-auto absolute inset-x-3 top-3 z-20 flex flex-col items-center gap-2">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl jc-surface jc-blur p-1.5 shadow-jc-float scrollbar-thin">
        {TOOLS.map((t) => {
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              aria-label={`${t.label} tool`}
              title={t.label}
              onClick={() => onToolChange(active ? null : t.id)}
              className={`${KEY} ${active ? ARMED : IDLE}`}
            >
              {ToolIcon(t.id)}
              <span className="hidden xl:inline">{t.label}</span>
            </button>
          );
        })}

        <div className="jc-hairline-v mx-1 h-6 shrink-0" aria-hidden />
        {DOC_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Ink color ${c}`}
            aria-pressed={color === c}
            title={c}
            onClick={() => onColorChange(c)}
            className={
              'h-7 w-7 shrink-0 rounded-full transition-transform duration-150 active:scale-90 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ' +
              (color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-graphite-950' : 'ring-1 ring-white/25')
            }
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="jc-hairline-v mx-1 h-6 shrink-0" aria-hidden />
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo"
        aria-label="Undo last annotation"
        className={`${ICON_KEY} ${IDLE} ${DISABLED}`}
      >
        <IconUndo size={18} />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo"
        aria-label="Redo last annotation"
        className={`${ICON_KEY} ${IDLE} ${DISABLED}`}
      >
        <IconRedo size={18} />
      </button>
      <button
        type="button"
        onClick={onClearPage}
        title="Clear this page's annotations"
        aria-label="Clear this page's annotations"
        className={`${ICON_KEY} ${IDLE}`}
      >
        <IconTrash size={18} />
      </button>

      <div className="jc-hairline-v mx-1 h-6 shrink-0" aria-hidden />
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        title="Previous page"
        aria-label="Previous page"
        className={`${ICON_KEY} ${IDLE} ${DISABLED}`}
      >
        <IconChevronLeft size={18} />
      </button>
      <span
        className="min-w-[2.75rem] text-center font-mono text-[11px] font-semibold text-titanium-200"
        aria-live="polite"
      >
        {page} / {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        title="Next page"
        aria-label="Next page"
        className={`${ICON_KEY} ${IDLE} ${DISABLED}`}
      >
        <IconChevronLeft size={18} className="rotate-180" />
      </button>

      <div className="jc-hairline-v mx-1 h-6 shrink-0" aria-hidden />
      <button type="button" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out" className={`${ICON_KEY} ${IDLE}`}>
        <span className="text-[15px] leading-none">−</span>
      </button>
      <span className="w-11 text-center font-mono text-[11px] font-semibold text-titanium-200" aria-live="polite">
        {zoomPercent}%
      </span>
      <button type="button" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in" className={`${ICON_KEY} ${IDLE}`}>
        <span className="text-[15px] leading-none">+</span>
      </button>
      <button
        type="button"
        onClick={onFit}
        title="Fit to screen"
        aria-label="Fit to screen"
        className={`${ICON_KEY} ${IDLE}`}
      >
        <IconFit size={18} />
      </button>

      <div className="jc-hairline-v mx-1 h-6 shrink-0" aria-hidden />
      <button
        type="button"
        onClick={onCloseDocument}
        title="Close the shared document for everyone"
        className={`${KEY} text-red-300 hover:bg-red-500/15 hover:text-red-200`}
      >
        <IconFileText size={16} />
        <span className="hidden lg:inline">End doc</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Close document view"
        aria-label="Close document view"
        className={`${ICON_KEY} bg-white text-graphite-900 hover:bg-white/90`}
      >
        <IconClose size={18} />
      </button>
      <div
        className="max-w-full truncate rounded-full bg-graphite-950/70 px-3 py-1 text-xs font-medium text-titanium-300 backdrop-blur"
        title={name}
      >
        {name}
      </div>
    </div>
  );
}
