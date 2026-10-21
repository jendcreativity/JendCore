/**
 * Voice-note helpers.
 *
 * Everything here is strictly in-memory: a recording becomes a `Blob`, is
 * converted to base64, and rides the existing realtime chat envelope so the
 * peer can rebuild it. Nothing is uploaded to storage, written to disk or
 * persisted anywhere, so a voice note is gone the moment the session ends
 * (the same lifecycle as chat text and participant names).
 */

/** Hard ceiling on one recording, kept short so a note stays cheap to relay. */
export const VOICE_MAX_MS = 30_000;

/** Mono speech bitrate — good intelligibility, small payload (30s ≈ 90 kB). */
export const VOICE_BITRATE = 24_000;

/**
 * Preferred container/codec, best first. Opus in WebM is the smallest and is
 * what Chrome/Firefox/Edge/Android produce; Safari records MP4/AAC.
 */
const VOICE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/aac',
];

/**
 * First recording format this browser can actually produce, or null when
 * MediaRecorder is missing. Callers use null to hide the voice control
 * entirely rather than ship a key that cannot work.
 */
export function pickVoiceMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  try {
    for (const mime of VOICE_MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    // Some browsers record fine but report no supported list.
    return '';
  } catch {
    return null;
  }
}

/**
 * Blob -> base64 (no `data:` prefix). Uses FileReader, which streams the
 * conversion internally, so a large recording cannot blow the call stack the
 * way `String.fromCharCode.apply` would.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the recording.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/** base64 -> Blob for playback. Chunked by hand so long notes stay safe. */
export function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime || 'audio/webm' });
}

/** `m:ss` for recording timers and note durations. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Local wall-clock time for a chat timestamp (e.g. "14:07"). */
export function formatClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Day heading (e.g. "Today", "12 Mar") for the chat's day separators. */
export function formatDay(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  try {
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  } catch {
    return date.toDateString();
  }
}