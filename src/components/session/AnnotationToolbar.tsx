import { AnnotationTool } from '../../lib/annotations';
import {
  IconArrow,
  IconCircle,
  IconClose,
  IconLine,
  IconPen,
  IconText,
  IconTrash,
} from '../Icon';

interface Props {
  tool: AnnotationTool | null;
  onSelect: (t: AnnotationTool | null) => void;
  onClear: () => void;
  onClose: () => void;
}

const ITEMS: { id: AnnotationTool; label: string }[] = [
  { id: 'freehand', label: 'Draw' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'circle', label: 'Circle' },
  { id: 'line', label: 'Line' },
  { id: 'text', label: 'Text' },
];

function IconFor(id: AnnotationTool) {
  switch (id) {
    case 'freehand': return <IconPen size={16} />;
    case 'arrow': return <IconArrow size={16} />;
    case 'circle': return <IconCircle size={16} />;
    case 'line': return <IconLine size={16} />;
    case 'text': return <IconText size={16} />;
  }
}

export default function AnnotationToolbar({ tool, onSelect, onClear, onClose }: Props) {
  return (
    <div className="pointer-events-auto absolute left-3 right-3 top-[56px] z-20 flex justify-center sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl glass-dark jend-shadow px-2 py-2 scrollbar-thin">
        {ITEMS.map((it) => {
          const active = tool === it.id;
          return (
            <button
              key={it.id}
              type="button"
              aria-pressed={active}
              aria-label={it.label}
              title={it.label}
              onClick={() => onSelect(active ? null : it.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                active ? 'bg-[#1877F2] text-white' : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              {IconFor(it.id)}
              <span className="hidden sm:inline">{it.label}</span>
            </button>
          );
        })}
        <div className="mx-1 h-6 w-px shrink-0 bg-white/10" aria-hidden />
        <button
          type="button"
          onClick={onClear}
          title="Clear all"
          aria-label="Clear all annotations"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/15 transition"
        >
          <IconTrash size={16} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close annotation"
          aria-label="Close annotation"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-ink-900 hover:bg-white/90 transition"
        >
          <IconClose size={16} />
        </button>
      </div>
    </div>
  );
}
