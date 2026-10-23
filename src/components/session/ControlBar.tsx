import ControlButton from './ControlButton';
import {
  IconCamera,
  IconChat,
  IconCrosshair,
  IconFlipCamera,
  IconMic,
  IconMicOff,
  IconPen,
  IconPhoneOff,
  IconScreenShare,
  IconUsers,
  IconShare,
  IconVideoOff,
  IconFileText,
} from '../Icon';

interface Props {
  micEnabled: boolean;
  cameraEnabled: boolean;
  annotateActive: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleAnnotate: () => void;
  onFlipCamera: () => void;
  onOpenChat: () => void;
  onOpenParticipants: () => void;
  onOpenShare: () => void;
  /** True while this user is the one broadcasting their view. */
  sharingSelf: boolean;
  /** Starts / stops broadcasting this user's view to everyone in the session. */
  onToggleShareView: () => void;
  onEnd: () => void;
  participantCount: number;
  chatUnread?: number;
  /**
   * Optional command-panel entry point for the Markup tab. Rendered only once a
   * handler is supplied, so no inert control ships before it is wired up.
   */
  onOpenTools?: () => void;
  /** Highlights the Markup key while its tab is open. */
  toolsActive?: boolean;
  /** Opens / closes the shared-document workspace. */
  onOpenDocument?: () => void;
  /** Highlights the Document key while a document view is up. */
  documentActive?: boolean;
  /**
   * True while media work is in flight (camera flip, re-acquire). Media keys
   * are held inert so a double tap cannot queue contradictory changes. The
   * page never sets this for the initial permission prompt, where pre-setting
   * mic/camera state must remain possible.
   */
  busy?: boolean;
  /**
   * False only when the device is known to expose a single camera (so flipping
   * is impossible). Undefined fails open: desktops and pre-permission states
   * keep the key enabled.
   */
  canFlip?: boolean;
}

/*
 * One key shape for every secondary control: 48px minimum, pill, readable
 * focus. The two surfaces are complete, self-contained class lists that are
 * never merged with each other, so Tailwind can never resolve a conflicting
 * utility against the wrong intent — neutral graphite when idle, the single
 * blue accent while a toggle is engaged.
 */
const KEY_BASE =
  'relative inline-flex h-12 min-w-[48px] items-center justify-center gap-2 rounded-full border text-xs font-semibold ' +
  'transition-colors duration-150 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ' +
  'active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none';

const SURFACE_IDLE =
  'border-white/[0.06] bg-white/[0.05] text-titanium-200 hover:bg-white/[0.10] hover:text-titanium-100';

// Disabled keys must read as inert, not merely faint: no hover response either.
const SURFACE_IDLE_DISABLED =
  'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white/[0.05] disabled:hover:text-titanium-200';

const SURFACE_ARMED = 'border-accent-500 bg-accent-500 text-white hover:bg-accent-600';

/**
 * Builds a secondary key's full class list. `iconOnly` swaps the text padding
 * for a fixed 48px square so Chat/People keep their labels while the icon-only
 * keys (flip camera) keep their exact width.
 */
function keyClass(surface: 'idle' | 'armed', iconOnly = false): string {
  return [
    KEY_BASE,
    surface === 'armed' ? SURFACE_ARMED : `${SURFACE_IDLE} ${SURFACE_IDLE_DISABLED}`,
    iconOnly ? 'w-12 px-0' : 'px-3.5',
  ].join(' ');
}

/**
 * Floating bar — every control reads as one instrument: neutral keys on a
 * graphite plate, blue only while a mode is engaged (Annotate, Markup tools,
 * sharing your view), red for End alone.
 *
 * Primary plate: Mic / Camera / Annotate / Markup tools / End.
 * Quiet cluster: Chat / People / Share invite / Share my view / camera flip.
 *
 * The two share keys are deliberately distinct, in both glyph and label:
 * "Share invite" copies the join link, "Share my view" broadcasts this user's
 * screen to everyone. Keys show visible text from sm up and stay icon-only on
 * phones, where all five still fit 320px with no horizontal scrolling.
 */
export default function ControlBar(p: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
      {/* Quiet cluster: Chat / People / Share invite / Share my view / flip */}
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full jc-surface jc-blur shadow-jc-float p-1 scrollbar-thin">
        <button
          type="button"
          onClick={p.onOpenChat}
          aria-label={`Open chat${p.chatUnread ? `, ${p.chatUnread} unread` : ''}`}
          title="Chat"
          className={keyClass('idle')}
        >
          <IconChat size={16} />
          <span className="hidden sm:inline">Chat</span>
          {p.chatUnread ? (
            <span className="min-w-[18px] rounded-full bg-accent-500 px-1 py-0.5 text-[10px] font-bold leading-none text-white">
              {p.chatUnread > 9 ? '9+' : p.chatUnread}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={p.onOpenParticipants}
          aria-label={`Open people panel, ${p.participantCount} in session`}
          title="People"
          className={keyClass('idle')}
        >
          <IconUsers size={16} />
          <span className="hidden sm:inline">People</span>
          <span className="text-titanium-400">{p.participantCount}</span>
        </button>
        {/* Share invite — the join link. IconShare (link nodes) + "invite", so it
            can never be mistaken for broadcasting your screen. */}
        <button
          type="button"
          onClick={p.onOpenShare}
          aria-label="Share invite link"
          title="Share invite link"
          className={keyClass('idle')}
        >
          <IconShare size={16} />
          <span className="hidden sm:inline">Share invite</span>
        </button>
        {/* Shared document — its own mode, so the key wears the file glyph and
            arms blue only while the document workspace is showing a document. */}
        {p.onOpenDocument ? (
          <button
            type="button"
            onClick={p.onOpenDocument}
            aria-pressed={p.documentActive}
            aria-label="Shared document"
            title="Shared document"
            className={keyClass(p.documentActive ? 'armed' : 'idle')}
          >
            <IconFileText size={16} />
            <span className="hidden sm:inline">Document</span>
          </button>
        ) : null}

        {/* Share my view — broadcasts this screen to everyone. Its own glyph and
            a real aria-pressed toggle, so the state is announced, not implied. */}
        <button
          type="button"
          onClick={p.onToggleShareView}
          aria-pressed={p.sharingSelf}
          aria-label={p.sharingSelf ? 'Stop sharing my view' : 'Share my view with everyone'}
          title={p.sharingSelf ? 'Stop sharing my view' : 'Share my view'}
          className={keyClass(p.sharingSelf ? 'armed' : 'idle')}
        >
          <IconScreenShare size={16} />
          <span className="hidden sm:inline">{p.sharingSelf ? 'Stop sharing' : 'Share my view'}</span>
        </button>
        <div className="jc-hairline-v mx-0.5 h-6 shrink-0" aria-hidden />
        {/* Camera flip lives here so the primary row is exactly
            Mic / Camera / Annotate / Markup tools / End at every width. */}
        <button
          type="button"
          onClick={p.onFlipCamera}
          disabled={p.busy || p.canFlip === false}
          aria-label="Switch camera"
          title={p.canFlip === false ? 'No other camera on this device' : 'Switch camera'}
          className={keyClass('idle', true)}
        >
          <IconFlipCamera size={16} />
        </button>
      </div>

      {/* Primary controls + End — one family, End separated by a hairline */}
      <div className="pointer-events-auto flex items-center gap-2 rounded-[22px] jc-surface-raised jc-blur px-3 py-3 sm:gap-3 sm:rounded-[24px] sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3" role="toolbar" aria-label="Session controls">
          {/* Mic and camera are real toggles: aria-pressed reports the state
              while the key itself stays neutral, so blue keeps meaning "a mode is
              engaged" and never "this device happens to be on". */}
          <ControlButton
            label={p.micEnabled ? 'Turn microphone off' : 'Turn microphone on'}
            variant={p.micEnabled ? 'primary' : 'off'}
            pressed={p.micEnabled}
            disabled={p.busy}
            onClick={p.onToggleMic}
          >
            {p.micEnabled ? <IconMic /> : <IconMicOff />}
          </ControlButton>
          <ControlButton
            label={p.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            variant={p.cameraEnabled ? 'primary' : 'off'}
            pressed={p.cameraEnabled}
            disabled={p.busy}
            onClick={p.onToggleCamera}
          >
            {p.cameraEnabled ? <IconCamera /> : <IconVideoOff />}
          </ControlButton>
          {/* Annotate now uses the crosshair — "point at the screen" — which
              frees the pen to mean exactly one thing: drawing / markup tools. */}
          <ControlButton
            label={p.annotateActive ? 'Exit annotation' : 'Annotate screen'}
            variant="primary"
            active={p.annotateActive}
            onClick={p.onToggleAnnotate}
          >
            <IconCrosshair />
          </ControlButton>
          {/* Was "More tools" behind an ellipsis: an overflow menu that only
              opened the Markup tab. It now says what it does and wears the pen. */}
          {p.onOpenTools ? (
            <ControlButton label="Markup tools" active={p.toolsActive} onClick={p.onOpenTools}>
              <IconPen />
            </ControlButton>
          ) : null}
        </div>
        <div className="jc-hairline-v h-9 shrink-0" aria-hidden />
        <ControlButton label="End session" variant="danger" onClick={p.onEnd}>
          <IconPhoneOff />
        </ControlButton>
      </div>
    </div>
  );
}
