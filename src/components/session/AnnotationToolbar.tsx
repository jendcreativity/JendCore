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
  /**
   * 'floating' (default) keeps the original placement over the stage.
   * 'inline' renders the same controls in normal flow so the command panel's
   * Markup tab reuses this component instead of a second, divergent toolbar.
   */
  variant?: 'floating' | 'inline';
}

const ITEMS: { id: AnnotationTool; label: string }[] = [
  { id: 'freehand', label: 'Draw' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'circle', label: 'Circle' },
  { id: 'line', label: 'Line' },
  { id: 'text', label: 'Text' },
];

// Markup glyphs sized for the 48px keys below.
function IconFor(id: AnnotationTool) {
  switch (id) {
    case 'freehand': return <IconPen size={18} />;
    case 'arrow': return <IconArrow size={18} />;
    case 'circle': return <IconCircle size={18} />;
    case 'line': return <IconLine size={18} />;
    case 'text': return <IconText size={18} />;
  }
}

// Markup keys share the control-bar family: 48px minimum, pill, titanium text.
// Blue is reserved for the armed tool, exactly as Annotate is on the control bar.
const KEY_CLASS = [
  'inline-flex h-12 min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-full px-3.5 text-xs font-semibold',
  'transition-colors duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
].join(' ');

const ICON_KEY_CLASS = KEY_CLASS + ' w-12 px-0';

export default function AnnotationToolbar({ tool, onSelect, onClear, onClose, variant = 'floating' }: Props) {
  const inline = variant === 'inline';

  return (
    <div
      className={
        inline
          ? 'flex w-full'
          : 'pointer-events-auto absolute left-3 right-3 top-[56px] z-20 flex justify-center sm:left-1/2 sm:right-auto sm:-translate-x-1/2'
      }
    >
      <div
        className={
          'flex max-w-full items-center gap-1.5 rounded-[24px] jc-surface p-1.5 scrollbar-thin ' +
          (inline ? 'w-full flex-wrap' : 'overflow-x-auto jc-blur')
        }
      >
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
              className={
                KEY_CLASS +
                ' ' +
                (active
                  ? 'bg-accent-500 text-white hover:bg-accent-600'
                  : 'bg-white/[0.06] text-titanium-100 hover:bg-white/[0.12]')
              }
            >
              {IconFor(it.id)}
              <span className="hidden sm:inline">{it.label}</span>
            </button>
          );
        })}
        <div className="jc-hairline-v mx-1 h-6 shrink-0" aria-hidden />
        <button
          type="button"
          onClick={onClear}
          title="Clear all"
          aria-label="Clear all annotations"
          className={ICON_KEY_CLASS + ' bg-white/[0.06] text-titanium-200 hover:bg-white/[0.12] hover:text-white'}
        >
          <IconTrash size={18} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close annotation"
          aria-label="Close annotation"
          className={ICON_KEY_CLASS + ' bg-white text-graphite-900 hover:bg-white/90'}
        >
          <IconClose size={18} />
        </button>
      </div>
    </div>
  );
}
