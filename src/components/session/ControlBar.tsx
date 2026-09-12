import ControlButton from './ControlButton';
import {
  IconCamera,
  IconChat,
  IconFlipCamera,
  IconMic,
  IconMicOff,
  IconPen,
  IconPhoneOff,
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
}

/**
 * Floating primary bar — four consistent blue controls, secondary actions
 * as a compact cluster, End distinct. Responsive but identical order.
 */
export default function ControlBar(p: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
      {/* Secondary row: Chat / Participants / Share — tiny pill cluster */}
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full glass-panel jend-shadow px-2 py-1.5">
        <button
          type="button"
          onClick={p.onOpenChat}
          aria-label={`Open chat${p.chatUnread ? `, ${p.chatUnread} unread` : ''}`}
          title="Chat"
          className="relative flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15 transition"
        >
          <IconChat size={14} />
          <span className="hidden sm:inline">Chat</span>
          {p.chatUnread ? (
            <span className="min-w-[18px] rounded-full bg-[#1877F2] px-1 py-0.5 text-[10px] font-bold leading-none text-white">
              {p.chatUnread > 9 ? '9+' : p.chatUnread}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={p.onOpenParticipants}
          aria-label="View participants"
          title="Participants"
          className="flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15 transition"
        >
          <IconUsers size={14} />
          <span>{p.participantCount}</span>
        </button>
        <button
          type="button"
          onClick={p.onOpenShare}
          aria-label="Share invite"
          title="Share"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/15 transition"
        >
          <IconShare size={14} />
        </button>
      </div>

      {/* Primary four + End — one visual family, End separated */}
      <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 rounded-[22px] sm:rounded-[24px] glass-dark jend-shadow px-3 py-3 sm:px-4">
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
          <ControlButton label="Switch camera" onClick={p.onFlipCamera}>
            <IconFlipCamera />
          </ControlButton>
        </div>
        <div className="ml-1 h-8 w-px shrink-0 bg-white/10 sm:ml-2" aria-hidden />
        <ControlButton label="End session" variant="danger" onClick={p.onEnd}>
          <IconPhoneOff />
        </ControlButton>
      </div>
    </div>
  );
}
