import { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  muted: boolean;
  label: string;
  cameraEnabled?: boolean;
  isRemote?: boolean;
  connectionState?: string;
}

/**
 * Renders a single MediaStream into a <video> element.
 *
 * - The local preview is always muted to prevent feedback.
 * - When the camera is off we show an informative placeholder instead
 *   of a frozen last-frame.
 */
export default function VideoTile({
  stream,
  muted,
  label,
  cameraEnabled = true,
  isRemote = false,
  connectionState,
}: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  const showPlaceholder = !stream || (isRemote ? false : !cameraEnabled);
  // Only show the remote waiting/connected placeholder when we have no remote stream.
  // Once peer.remoteStream is set we show the video, regardless of transient
  // connectionState churn. The text inside still reflects connecting vs waiting.
  const showRemoteWaiting = isRemote && !stream;

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-contain ${isRemote ? '' : 'scale-x-[-1] '} ${
          showPlaceholder ? 'hidden' : ''
        }`}
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
    </div>
  );
}
