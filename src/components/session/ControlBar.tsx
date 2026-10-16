import ControlButton from './ControlButton';
import {
  IconCamera,
  IconChat,
  IconFlipCamera,
  IconMic,
  IconMicOff,
  IconPen,
  IconPhoneOff,
  IconTool,
  IconUsers,
  IconShare,
  IconVideoOff,
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
  onEnd: () => void;
  participantCount: number;
  chatUnread?: number;
  /**
   * Optional command-panel entry point. The Tools key is rendered only once a
   * handler is supplied, so no inert control ships before it is wired up.
   */
  onOpenTools?: () => void;
  /** Highlights the Tools key while its panel is open. */
  toolsActive?: boolean;
}

// Secondary keys share one shape: 48px minimum, pill, calm graphite, readable focus.
const KEY_CLASS = [
  'relative inline-flex h-12 min-w-[48px] items-center justify-center gap-2 rounded-full',
  'border border-white/[0.06] bg-white/[0.05] text-xs font-semibold text-titanium-200',
  'transition-colors duration-150 hover:bg-white/[0.10] hover:text-titanium-100',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
  'active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none',
].join(' ');

/**
 * Floating bar — the five controls read as one instrument: neutral keys on a
 * graphite plate, blue only for an engaged mode (Annotate / Tools), red for End.
 * The five primary keys (Mic, Camera, Annotate, Tools, End) sit on the main
 * plate; camera flip moved into the quiet cluster above with Chat / People /
 * Share, so the row fits 320-430px with no horizontal scrolling.
 */
export default function ControlBar(p: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
      {/* Secondary row: Chat / People / Share + camera flip — quiet cluster, 48px targets */}
      <div className="pointer-events-auto flex items-center gap-1 rounded-full jc-surface jc-blur shadow-jc-float p-1">
        <button
          type="button"
          onClick={p.onOpenChat}
          aria-label={`Open chat${p.chatUnread ? `, ${p.chatUnread} unread` : ''}`}
          title="Chat"
          className={`${KEY_CLASS} px-3.5`}
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
          aria-label="View participants"
          title="Participants"
          className={`${KEY_CLASS} px-3.5`}
        >
          <IconUsers size={16} />
          <span>{p.participantCount}</span>
        </button>
        <button
          type="button"
          onClick={p.onOpenShare}
          aria-label="Share invite"
          title="Share"
          className={`${KEY_CLASS} w-12 px-0`}
        >
          <IconShare size={16} />
        </button>
        <div className="jc-hairline-v mx-0.5 h-6 shrink-0" aria-hidden />
        {/* Camera flip lives here so the primary row is exactly
            Mic / Camera / Annotate / Tools / End at every width. */}
        <button
          type="button"
          onClick={p.onFlipCamera}
          aria-label="Switch camera"
          title="Switch camera"
          className={`${KEY_CLASS} w-12 px-0`}
        >
          <IconFlipCamera size={16} />
        </button>
      </div>

      {/* Primary controls + End — one family, End separated by a hairline */}
      <div className="pointer-events-auto flex items-center gap-2 rounded-[22px] jc-surface-raised jc-blur px-3 py-3 sm:gap-3 sm:rounded-[24px] sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3" role="toolbar" aria-label="Session controls">
          <ControlButton
            label={p.micEnabled ? 'Turn microphone off' : 'Turn microphone on'}
            variant={p.micEnabled ? 'primary' : 'off'}
            onClick={p.onToggleMic}
          >
            {p.micEnabled ? <IconMic /> : <IconMicOff />}
          </ControlButton>
          <ControlButton
            label={p.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            variant={p.cameraEnabled ? 'primary' : 'off'}
            onClick={p.onToggleCamera}
          >
            {p.cameraEnabled ? <IconCamera /> : <IconVideoOff />}
          </ControlButton>
          <ControlButton
            label={p.annotateActive ? 'Exit annotation' : 'Annotate screen'}
            variant="primary"
            active={p.annotateActive}
            onClick={p.onToggleAnnotate}
          >
            <IconPen />
          </ControlButton>
          {p.onOpenTools ? (
            <ControlButton label="Open tools" active={p.toolsActive} onClick={p.onOpenTools}>
              <IconTool />
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
