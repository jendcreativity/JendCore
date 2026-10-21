/**
 * Records a short voice note for the chat.
 *
 * Microphone sharing rule: if the session already has a live, unmuted audio
 * track we record that exact track, so the note cannot fight the call for the
 * device. When the mic is muted or absent we open a dedicated capture for the
 * recording and stop it (hardware LED included) the moment the note is done.
 *
 * Nothing is persisted: the finished note is handed back as an in-memory blob
 * converted to base64, and it disappears with the session.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceNote } from '../lib/chat';
import { VOICE_BITRATE, VOICE_MAX_MS, blobToBase64, pickVoiceMime } from '../lib/voice';

interface Options {
  /** Live microphone track from the session, reused when it is usable. */
  sourceTrack?: MediaStreamTrack | null;
  /** Called once with each finished note. */
  onComplete: (note: VoiceNote) => void;
}

export interface VoiceRecorderControls {
  /** False when this browser cannot record — callers must hide the control. */
  supported: boolean;
  recording: boolean;
  elapsedMs: number;
  error: string | null;
  start: () => void;
  /** Finish and deliver the note. */
  stop: () => void;
  /** Abandon the note without delivering it. */
  cancel: () => void;
}

export function useVoiceRecorder({ sourceTrack, onComplete }: Options): VoiceRecorderControls {
  const [supported] = useState(
    () =>
      pickVoiceMime() !== null &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia,
  );
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  /** A capture this hook opened itself, so it can always be released again. */
  const ownedStreamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const clearTimers = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const releaseOwned = useCallback(() => {
    const owned = ownedStreamRef.current;
    ownedStreamRef.current = null;
    if (!owned) return;
    owned.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* already stopped */
      }
    });
  }, []);

  /** Resolves the stream to record from, opening a capture only if needed. */
  const resolveSource = useCallback(async (): Promise<MediaStream> => {
    const live = sourceTrack;
    if (live && live.readyState === 'live' && live.enabled) {
      return new MediaStream([live]);
    }
    const fresh = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    ownedStreamRef.current = fresh;
    return fresh;
  }, [sourceTrack]);

  const start = useCallback(() => {
    if (recorderRef.current) return;
    if (!supported) {
      setError('This browser cannot record voice notes.');
      return;
    }
    setError(null);
    cancelledRef.current = false;
    chunksRef.current = [];

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await resolveSource();
      } catch (e) {
        const name = (e as DOMException)?.name;
        releaseOwned();
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'Microphone access is blocked, so a voice note cannot be recorded.'
            : 'The microphone is unavailable for recording. Check your device and try again.',
        );
        return;
      }

      const mime = pickVoiceMime() ?? '';
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          ...(mime ? { mimeType: mime } : {}),
          audioBitsPerSecond: VOICE_BITRATE,
        });
      } catch {
        releaseOwned();
        setError('Recording could not start on this device.');
        return;
      }

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        clearTimers();
        setRecording(false);
        releaseOwned();
        recorderRef.current = null;
        setError('Recording stopped unexpectedly. Please try again.');
      };
      recorder.onstop = () => {
        clearTimers();
        setRecording(false);
        recorderRef.current = null;
        const type = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        releaseOwned();
        if (cancelledRef.current || blob.size === 0) return;
        const durationMs = Math.max(1000, Math.min(VOICE_MAX_MS, Date.now() - startedAtRef.current));
        void blobToBase64(blob)
          .then((data) => onCompleteRef.current({ mime: type, data, durationMs }))
          .catch(() => setError('The voice note could not be prepared. Please try again.'));
      };

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      try {
        recorder.start(250);
      } catch {
        recorderRef.current = null;
        setRecording(false);
        releaseOwned();
        setError('Recording could not start on this device.');
        return;
      }

      tickRef.current = window.setInterval(() => {
        setElapsedMs(Math.min(VOICE_MAX_MS, Date.now() - startedAtRef.current));
      }, 200);
      autoStopRef.current = window.setTimeout(() => {
        // Reaching the ceiling sends the note rather than silently dropping it.
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }, VOICE_MAX_MS);
    })();
  }, [clearTimers, releaseOwned, resolveSource, supported]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    cancelledRef.current = false;
    try {
      recorder.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    cancelledRef.current = true;
    if (!recorder) {
      clearTimers();
      setRecording(false);
      setElapsedMs(0);
      releaseOwned();
      return;
    }
    try {
      recorder.stop();
    } catch {
      /* already stopped */
    }
    setElapsedMs(0);
  }, [clearTimers, releaseOwned]);

  // A note never outlives the panel: leaving the session releases mic + timers.
  useEffect(
    () => () => {
      clearTimers();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== 'inactive') {
        cancelledRef.current = true;
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      releaseOwned();
    },
    [clearTimers, releaseOwned],
  );

  return { supported, recording, elapsedMs, error, start, stop, cancel };
}