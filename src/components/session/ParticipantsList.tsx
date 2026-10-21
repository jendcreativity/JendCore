import { ReactNode } from 'react';
import { IconScreenShare, IconUsers } from '../Icon';

export interface Participant {
  id: string;
  /** epoch ms */
  joinedAt: number;
  /** Display name this peer chose (in-memory only, session-scoped). */
  name?: string;
}

interface Props {
  /** Room code, shown as a read-only chip beside the head count. */
  code: string;
  /** Total head count including you. */
  participantCount: number;
  micEnabled: boolean;
  cameraEnabled: boolean;
  /** Peers from signalling (self excluded by the caller). */
  peers: Participant[];
  /** Peer we hold a connection to, if any. */
  remotePeerId: string | null;
  /** True once the remote stream is live — drives the truthful green pill. */
  remoteConnected: boolean;
  /** Raw peer connection state, shown verbatim while not connected. */
  connectionState: string;
  /** This user's peer id, so the roster can tell "you" from a peer. */
  selfId: string;
  /** This user's chosen display name (session-only; never stored). */
  selfName: string;
  /** Renames this user. The value is announced to peers and stored nowhere. */
  onNameChange: (name: string) => void;
  /** Peer currently broadcasting their view, if any — may be this user. */
  sharingPeerId: string | null;
  /** True while this user is the one broadcasting their view. */
  sharingSelf: boolean;
  /** Real signalling toggle: share / stop sharing this view. */
  onToggleShareView: () => void;
  /** Optional invite block, e.g. <ShareSheet compact url={...} code={...} />. */
  invite?: ReactNode;
}

/** "Ada Lovelace" -> "AL", "Ada" -> "AD", empty -> the fallback. */
function initials(name: string, fallback: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Marks the one row that is broadcasting right now. */
function SharingPill() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] font-bold text-accent-400">
      <IconScreenShare size={11} />
      Sharing
    </span>
  );
}

/**
 * People panel — the roster, the invite block and the share-view toggle.
 *
 * Copy, status logic and signalling are lifted unchanged from the page's
 * previous inline markup: "You" carries the local camera/mic truth, the remote
 * peer shows Connected only when a live stream exists (never for signalling
 * alone), and the share button drives the same real toggle. Phase 2A only
 * replaces the surfaces, tokens and touch targets.
 */
export default function ParticipantsList({
  code,
  participantCount,
  micEnabled,
  cameraEnabled,
  peers,
  remotePeerId,
  remoteConnected,
  connectionState,
  selfId,
  selfName,
  onNameChange,
  sharingPeerId,
  sharingSelf,
  onToggleShareView,
  invite,
}: Props) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-titanium-300">
        <IconUsers size={14} />
        <span>{participantCount} in session</span>
        <span className="ml-auto rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] tracking-widest text-titanium-200">
          {code}
        </span>
      </div>

      {/* Names exist to answer one question: who is talking and who is sharing.
          The value is session state only — announced to the people in this room
          and dropped the moment the session ends, never stored. */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
        <label htmlFor="participant-name" className="text-xs font-semibold text-titanium-300">
          Your name
        </label>
        <p className="mt-1 text-[11px] leading-snug text-titanium-500">
          Everyone in this session sees it beside your messages and on the screen you share.
          Nothing is saved — it disappears when the session ends.
        </p>
        <input
          id="participant-name"
          type="text"
          value={selfName}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={24}
          placeholder="e.g. Ada"
          autoComplete="off"
          className="mt-2 h-10 w-full rounded-full border border-white/[0.12] bg-white/[0.08] px-3.5 text-sm text-white transition-colors placeholder:text-titanium-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-500 text-xs font-bold text-white">
            {initials(selfName, 'You')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold leading-none text-white">
                {selfName.trim() || 'You'}
              </div>
              {sharingPeerId === selfId ? <SharingPill /> : null}
            </div>
            <div className="mt-1 truncate text-xs text-titanium-400">
              {cameraEnabled ? 'Camera on' : 'Camera off'} • {micEnabled ? 'Mic on' : 'Muted'}
            </div>
          </div>
        </div>

        {peers.map((p) => {
          const isRemote = p.id === remotePeerId;
          const connected = isRemote && remoteConnected;
          const peerName = p.name?.trim() || (isRemote ? 'Remote' : 'Participant');
          // joinedAt comes from the presence envelope; a non-numeric value here
          // would render "Invalid Date", so it is stated rather than shown.
          const joined = Number.isFinite(p.joinedAt)
            ? new Date(p.joinedAt).toLocaleTimeString()
            : null;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-3"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.06] text-xs font-bold text-titanium-100">
                {initials(p.name ?? '', p.id.slice(0, 2).toUpperCase())}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-semibold leading-none text-white">{peerName}</div>
                  {sharingPeerId === p.id ? <SharingPill /> : null}
                </div>
                <div className="mt-1 truncate text-xs text-titanium-400">
                  {joined ? `Joined ${joined}` : 'In session'}
                </div>
              </div>
              <span
                className={
                  'shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ' +
                  (connected ? 'bg-status-success/15 text-status-success' : 'bg-white/[0.06] text-titanium-300')
                }
              >
                {isRemote ? (connected ? 'Connected' : connectionState) : 'In session'}
              </span>
            </div>
          );
        })}

        {peers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/[0.12] px-3 py-6 text-center text-sm text-titanium-400">
            No one else yet. Share the invite to bring someone in.
          </div>
        )}
      </div>

      {invite ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">{invite}</div>
      ) : null}

      <button
        type="button"
        onClick={onToggleShareView}
        className={
          'h-12 w-full rounded-full px-3 text-sm font-bold transition-colors ' +
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ' +
          'active:scale-[0.99] motion-reduce:transition-none motion-reduce:transform-none ' +
          (sharingSelf ? 'bg-status-danger text-white hover:brightness-110' : 'bg-accent-500 text-white hover:bg-accent-600')
        }
      >
        {sharingSelf ? 'Stop sharing' : 'Share my view'}
      </button>
    </div>
  );
}
