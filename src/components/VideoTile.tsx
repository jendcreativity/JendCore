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
        <div className="absolute inset-0 flex flex-col items-center justify-center text-ink-300">
          <div className="h-16 w-16 rounded-full bg-ink-800 flex items-center justify-center mb-3">
            <span className="text-2xl">📷</span>
          </div>
          <p className="text-sm">Camera off</p>
        </div>
      )}
      {showRemoteWaiting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-ink-300">
          <div className="h-16 w-16 rounded-full bg-ink-800 flex items-center justify-center mb-3 animate-pulse">
            <span className="text-2xl">📡</span>
          </div>
          <p className="text-sm">
            {connectionState === 'connecting'
              ? 'Connecting…'
              : 'Waiting for the other person to join…'}
          </p>
        </div>
      )}
      <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
        {label}
      </span>
      {micEnabled === false && (
        <span className="absolute bottom-3 right-3 rounded-full bg-red-500/90 px-2 py-1 text-xs text-white">
          🔇
        </span>
      )}
    </div>
  );
}
