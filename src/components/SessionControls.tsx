import { AnnotationTool } from '../lib/annotations';
import {
  IconArrow,
  IconCamera,
  IconChat,
  IconCircle,
  IconFlipCamera,
  IconLine,
  IconMic,
  IconMicOff,
  IconPen,
  IconPhoneOff,
  IconText,
  IconTrash,
  IconVideoOff,
} from './Icon';

interface Props {
  micEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onFlipCamera: () => void;

  chatOpen: boolean;
  onToggleChat: () => void;

  annotationTool: AnnotationTool | null;
  onSelectTool: (tool: AnnotationTool | null) => void;
  annotationsOpen: boolean;
  onToggleAnnotations: () => void;
  onClearAnnotations: () => void;

  onEnd: () => void;
}

/**
 * Bottom control bar.
 *
 * On mobile the controls sit in a single row above the safe-area inset.
 * On wider screens we wrap them onto two rows: media controls and
 * annotation/chat controls.
 *
 * Every control has a visible label and a minimum 44px touch target.
 */
export default function SessionControls(props: Props) {
  const {
    micEnabled,
    cameraEnabled,
    onToggleMic,
    onToggleCamera,
    onFlipCamera,
    chatOpen,
    onToggleChat,
    annotationTool,
    onSelectTool,
    annotationsOpen,
    onToggleAnnotations,
    onClearAnnotations,
    onEnd,
  } = props;

  const annotating = annotationTool !== null;

  return (
    <div className="bg-ink-800/95 backdrop-blur border-t-2 border-ink-700 safe-bottom">
      {/* Annotation tools (when open) */}
      {annotationsOpen && (
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-3 border-b border-ink-700 bg-ink-800">
          <ToolButton
            active={annotationTool === 'freehand'}
            onClick={() => onSelectTool(annotationTool === 'freehand' ? null : 'freehand')}
            label="Draw"
          >
            <IconPen size={20} />
          </ToolButton>
          <ToolButton
            active={annotationTool === 'arrow'}
            onClick={() => onSelectTool(annotationTool === 'arrow' ? null : 'arrow')}
            label="Arrow"
          >
            <IconArrow size={20} />
          </ToolButton>
          <ToolButton
            active={annotationTool === 'circle'}
            onClick={() => onSelectTool(annotationTool === 'circle' ? null : 'circle')}
            label="Circle"
          >
            <IconCircle size={20} />
          </ToolButton>
          <ToolButton
            active={annotationTool === 'line'}
            onClick={() => onSelectTool(annotationTool === 'line' ? null : 'line')}
            label="Line"
          >
            <IconLine size={20} />
          </ToolButton>
          <ToolButton
            active={annotationTool === 'text'}
            onClick={() => onSelectTool(annotationTool === 'text' ? null : 'text')}
            label="Text"
          >
            <IconText size={20} />
          </ToolButton>
          <div className="flex-1" />
          <ToolButton onClick={onClearAnnotations} label="Clear">
            <IconTrash size={20} />
          </ToolButton>
        </div>
      )}

      {/* Main controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-4 sm:px-4 sm:py-3">
        {/* Media controls */}
        <CtrlButton
          onClick={onToggleMic}
          label={micEnabled ? 'Mute' : 'Unmute'}
          variant={micEnabled ? 'neutral' : 'danger'}
        >
          {micEnabled ? <IconMic size={24} /> : <IconMicOff size={24} />}
        </CtrlButton>

        <CtrlButton
          onClick={onToggleCamera}
          label={cameraEnabled ? 'Camera off' : 'Camera on'}
          variant={cameraEnabled ? 'neutral' : 'danger'}
        >
          {cameraEnabled ? <IconCamera size={24} /> : <IconVideoOff size={24} />}
        </CtrlButton>

        <CtrlButton onClick={onFlipCamera} label="Flip" variant="neutral">
          <IconFlipCamera size={24} />
        </CtrlButton>

        {/* Spacer on mobile */}
        <div className="flex-1 sm:flex-none" />
        
        <CtrlButton
          onClick={onToggleAnnotations}
          label="Annotate"
          variant={annotationsOpen ? 'active' : 'neutral'}
        >
          <IconPen size={24} />
        </CtrlButton>

        <CtrlButton
          onClick={onToggleChat}
          label="Chat"
          variant={chatOpen ? 'active' : 'neutral'}
        >
          <IconChat size={24} />
        </CtrlButton>

        {/* End session (danger) */}
        <CtrlButton onClick={onEnd} label="End" variant="danger">
          <IconPhoneOff size={24} />
        </CtrlButton>
      </div>

      {/* Active state indicator */}
      {annotating && (
        <p className="text-center text-xs text-ink-300 pb-3 font-medium">
          Drawing mode active • Tap again to stop
        </p>
      )}
    </div>
  );
}

function CtrlButton({
  children,
  onClick,
  label,
  variant = 'neutral',
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  variant?: 'neutral' | 'active' | 'danger';
}) {
  const cls =
    variant === 'danger'
      ? 'bg-red-500/90 hover:bg-red-600 active:bg-red-700 text-white'
      : variant === 'active'
      ? 'bg-accent-500 hover:bg-accent-600 active:bg-accent-700 text-white'
      : 'bg-ink-700 hover:bg-ink-600 active:bg-ink-500 text-ink-50';
  
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-14 w-14 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 font-medium text-sm ${cls}`}
    >
      <div className="flex flex-col items-center justify-center gap-1">
        <div>{children}</div>
        <span className="hidden sm:block text-xs">{label}</span>
      </div>
    </button>
  );
}

function ToolButton({
  children,
  onClick,
  label,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`h-10 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors flex-shrink-0 ${
        active
          ? 'bg-accent-500 text-white'
          : 'bg-ink-700 text-ink-100 hover:bg-ink-600'
      }`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
