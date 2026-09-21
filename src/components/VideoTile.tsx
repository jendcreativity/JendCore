import { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  muted: boolean;
  label: string;
  cameraEnabled?: boolean;
  micEnabled?: boolean;
  isRemote?: boolean;
  /** Reserved for future "Mirror Self View" toggle. Default false = true orientation. */
  mirrorSelfView?: boolean;
  /** @deprecated kept for compatibility; ignored — video is never mirrored by default. */
  facing?: 'user' | 'environment';
  connectionState?: string;
}

/**
 * Renders a single MediaStream into a <video> element.
 *
 * Mirroring contract (presentation only, MediaStream/track untouched):
 * - No video is mirrored by default — local preview and remote both show
 *   true-to-reality orientation (left is left) for visual collaboration.
 *   This applies to front ('user') and rear ('environment') cameras,
 *   all device combos, and multi-party. No MediaStream/track transform.
 * - Optional local mirror is available via `mirrorSelfView` (future setting):
 *   when true, the LOCAL preview (isRemote=false) is mirrored with
 *   `scale-x-[-1]` for selfie comfort; remote is NEVER mirrored.
 * - When the camera is off we show an informative placeholder instead
 *   of a frozen last-frame.
 */
export default function VideoTile({
  stream,
  muted,
  label,
  cameraEnabled = true,
  micEnabled = true,
  isRemote = false,
  mirrorSelfView = false,
  facing: _facing,
  connectionState,
}: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      const pr = el.play();
      if (pr && typeof (pr as Promise<void>).catch === 'function') (pr as Promise<void>).catch(() => {});
    }
  }, [stream]);

  const showPlaceholder = !stream || !cameraEnabled;
  // Only show the remote waiting/connected placeholder when we have no remote stream.
  // Once peer.remoteStream is set we show the video, regardless of transient
  // connectionState churn. The text inside still reflects connecting vs waiting.
  const showRemoteWaiting = isRemote && !stream;
  // True orientation by default. Optional local self-view mirror only when mirrorSelfView is true; remote never mirrored.
  const isMirrored = !isRemote && mirrorSelfView === true;

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1] ' : ''}${showPlaceholder ? 'hidden' : ''}`}
      />
      {showPlaceholder && !showRemoteWaiting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a1020] text-white/70">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] border border-white/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          </div>
          <p className="mt-3 text-[13px] font-medium tracking-tight text-white/80">Camera off</p>
          <p className="mt-1 text-xs text-white/45">{label}</p>
        </div>
      )}
      {showRemoteWaiting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070d1a] text-white/70 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] border border-white/10 animate-pulse">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16 8a6 6 0 0 1 6 6v3a2 2 0 0 1-2 2h-2"/><path d="M8 8a6 6 0 0 0-6 6v3a2 2 0 0 0 2 2h2"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="15" x2="12" y2="18"/></svg>
          </div>
          <p className="mt-4 max-w-[28ch] text-sm font-semibold leading-snug text-white">
            {connectionState === 'connecting' ? 'Connecting…' : connectionState === 'failed' || connectionState === 'disconnected' ? 'Reconnecting…' : 'Waiting for the other person to join…'}
          </p>
          <p className="mt-1.5 max-w-[32ch] text-xs leading-relaxed text-white/55">
            {connectionState === 'connecting' || connectionState === 'failed' || connectionState === 'disconnected' ? 'Establishing secure link' : 'Share the invite code to bring someone in'}
          </p>
        </div>
      )}
      {/* subtle label — not competing with content */}
      <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold tracking-tight text-white/90 backdrop-blur border border-white/10">
        {label}
      </span>
      {micEnabled === false && (
        <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M19 10v2a7 7 0 0 1-6 7"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          Muted
        </span>
      )}
    </div>
  );
}
