import { useEffect, useMemo, useRef, useState } from 'react';
import { IconPause, IconPlay } from './Icon';
import { VoiceNote } from '../lib/chat';
import { base64ToBlob, formatDuration } from '../lib/voice';

interface Props {
  note: VoiceNote;
  /** True for the local author, so the player tints to match its bubble. */
  mine: boolean;
}

/**
 * Voice-note player.
 *
 * The audio is rebuilt from the message's in-memory base64 into an object URL
 * owned by this component and revoked on unmount, so a note leaves no trace
 * once the session (or its panel) is gone. Nothing is fetched or uploaded —
 * the bytes are the note the sender's browser recorded.
 */
export default function ChatVoiceNote({ note, mine }: Props) {
  const url = useMemo(() => {
    try {
      return URL.createObjectURL(base64ToBlob(note.data, note.mime));
    } catch {
      // `atob` throws on malformed base64. Decoding here, inside the guard,
      // means a corrupt note renders as a placeholder instead of taking the
      // whole transcript down mid-render.
      return null;
    }
  }, [note.data, note.mime]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Revoke the object URL when the note leaves the transcript. A note that
  // failed to decode never allocated one.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    setPlaying(false);
    setElapsed(0);
  }, [url]);

  // Reached only when the payload could not be decoded. Every hook above has
  // already run, so returning here cannot change hook order.
  if (!url) {
    return (
      <span
        className={`inline-block px-0.5 py-1 text-[11px] font-medium ${
          mine ? 'text-white/80' : 'text-titanium-400'
        }`}
      >
        Voice note unavailable
      </span>
    );
  }

  const total = note.durationMs;
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;
  const playClass = mine
    ? 'bg-white/25 text-white hover:bg-white/35'
    : 'bg-white/[0.10] text-titanium-100 hover:bg-white/[0.18]';
  const trackClass = mine ? 'bg-white/30' : 'bg-white/[0.16]';
  const fillClass = mine ? 'bg-white' : 'bg-titanium-100';

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }

  function seek(e: React.MouseEvent<HTMLButtonElement>) {
    const el = audioRef.current;
    if (!el || total <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const seconds = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : total / 1000;
    try {
      el.currentTime = ratio * seconds;
    } catch {
      /* not seekable yet */
    }
    setElapsed(ratio * total);
  }

  return (
    <div className="flex items-center gap-2">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setElapsed(0);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          const seconds = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : total / 1000;
          if (seconds > 0) setElapsed((el.currentTime / seconds) * total);
        }}
        className="sr-only"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        title={playing ? 'Pause' : 'Play'}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${playClass}`}
      >
        {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
      </button>
      <button
        type="button"
        onClick={seek}
        aria-label="Seek within voice note"
        className="flex h-8 min-w-0 flex-1 items-center"
      >
        <span className={`relative block h-1.5 w-full min-w-[64px] rounded-full ${trackClass}`}>
          <span
            className={`absolute inset-y-0 left-0 rounded-full ${fillClass}`}
            style={{ width: `${progress * 100}%` }}
          />
        </span>
      </button>
      <span
        className={`shrink-0 font-mono text-[11px] tabular-nums ${mine ? 'text-white/80' : 'text-titanium-400'}`}
      >
        {formatDuration(playing ? elapsed : total)}
      </span>
    </div>
  );
}