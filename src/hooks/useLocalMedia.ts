/**
 * Manages the local camera + microphone.
 *
 * Behaviour:
 *   - On mount we request user media with sensible default constraints.
 *   - Mic and camera toggles act on the tracks in-place (no renegotiation
 *     needed by WebRTC senders that share the stream).
 *   - Camera facing mode (front/rear) is toggled by re-acquiring the
 *     video track with `facingMode: 'environment'`. Browsers that don't
 *     support `facingMode` (mostly desktop) ignore the constraint.
 *
 * Permission errors surface as a `permissionError` string so the UI
 * can show actionable guidance instead of crashing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraFacing = 'user' | 'environment';

export interface LocalMediaState {
  stream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  facing: CameraFacing;
  permissionError: string | null;
  busy: boolean;
}

export interface LocalMediaControls extends LocalMediaState {
  toggleMic: () => void;
  toggleCamera: () => void;
  flipCamera: () => Promise<void>;
  stop: () => void;
}

const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: 'user',
  },
};

export function useLocalMedia(autoStart = true): LocalMediaControls {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [facing, setFacing] = useState<CameraFacing>('user');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const acquire = useCallback(
    async (preferredFacing: CameraFacing) => {
      setBusy(true);
      setPermissionError(null);
      try {
        const constraints: MediaStreamConstraints = {
          audio: DEFAULT_CONSTRAINTS.audio,
          video: {
            ...(DEFAULT_CONSTRAINTS.video as MediaTrackConstraints),
            facingMode:
              preferredFacing === 'environment'
                ? { ideal: 'environment' }
                : { ideal: 'user' },
          },
        };
        const next = await navigator.mediaDevices.getUserMedia(constraints);
        // Replace any prior tracks so old hardware LEDs go off.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        streamRef.current = next;
        setStream(next);
        // Honour initial toggle states if user disabled them earlier.
        next.getAudioTracks().forEach(
          (t) => (t.enabled = micEnabledRef.current),
        );
        next.getVideoTracks().forEach(
          (t) => (t.enabled = cameraEnabledRef.current),
        );
        setFacing(preferredFacing);
      } catch (err) {
        const e = err as DOMException;
        if (
          e.name === 'NotAllowedError' ||
          e.name === 'SecurityError' ||
          e.name === 'PermissionDeniedError'
        ) {
          setPermissionError(
            'Camera or microphone access was blocked. Please allow it in your browser settings and try again.',
          );
        } else if (e.name === 'NotFoundError') {
          setPermissionError(
            'No camera or microphone was found. Check that a camera is connected and try again.',
          );
        } else if (e.name === 'NotReadableError') {
          setPermissionError(
            'Camera or microphone is already in use by another app or browser tab. Close the other app and try again.',
          );
        } else if (e.name === 'OverconstrainedError') {
          setPermissionError(
            'This device cannot satisfy the requested camera constraints. Try again or pick a different camera.',
          );
        } else if (e.name === 'AbortError') {
          setPermissionError(
            'Camera start was interrupted. Please try again.',
          );
        } else {
          setPermissionError(
            'Could not start your camera or microphone. Please check your device and try again.',
          );
        }
        console.warn('[jendcore] getUserMedia failed', e);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // Live refs so callbacks always see the latest toggle state.
  const micEnabledRef = useRef(micEnabled);
  const cameraEnabledRef = useRef(cameraEnabled);
  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);
  useEffect(() => {
    cameraEnabledRef.current = cameraEnabled;
  }, [cameraEnabled]);

  useEffect(() => {
    if (!autoStart) return;
    void acquire('user');
    return () => stop();
    // We only want to start once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = useCallback(() => {
    setMicEnabled((prev) => {
      const next = !prev;
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraEnabled((prev) => {
      const next = !prev;
      streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  const flipCamera = useCallback(async () => {
    const target: CameraFacing = facing === 'user' ? 'environment' : 'user';
    setBusy(true);
    setPermissionError(null);
    try {
      const current = streamRef.current;
      if (!current) { await acquire(target); return; }

      // Preserve audio tracks — never re-request microphone during a flip.
      const audios = current.getAudioTracks().slice();

      let newTrack: MediaStreamTrack | null = null;
      let tmp: MediaStream | null = null;
      let lastErr: DOMException | null = null;

      // Helper: try getUserMedia(audio:false) with one NotReadable retry that
      // releases the hardware lock (stop + pause) before retrying.
      const tryVideo = async (constraints: MediaStreamConstraints): Promise<MediaStreamTrack | null> => {
        try {
          const s = await navigator.mediaDevices.getUserMedia(constraints);
          if (tmp) tmp.getTracks().forEach((t) => { try { t.stop(); } catch {} });
          tmp = s;
          return s.getVideoTracks()[0] ?? null;
        } catch (e) {
          lastErr = e as DOMException;
          const name = lastErr?.name;
          if (name === 'NotReadableError' || name === 'AbortError') {
            try {
              current.getVideoTracks().forEach((t) => { try { t.enabled = false; } catch {} });
              await new Promise<void>((r) => setTimeout(r, 120));
              current.getVideoTracks().forEach((t) => { try { t.stop(); } catch {} });
              await new Promise<void>((r) => setTimeout(r, 180));
              const s2 = await navigator.mediaDevices.getUserMedia(constraints);
              if (tmp) tmp.getTracks().forEach((t) => { try { t.stop(); } catch {} });
              tmp = s2;
              lastErr = null;
              return s2.getVideoTracks()[0] ?? null;
            } catch (e2) {
              lastErr = e2 as DOMException;
              return null;
            }
          }
          return null;
        }
      };

      // 1) Try the other deviceId (best on iOS where facingMode is ignored).
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const cams = devs.filter((d) => d.kind === 'videoinput');
        if (cams.length >= 2) {
          const cur = current.getVideoTracks()[0];
          const curId = (cur?.getSettings?.().deviceId as string) || null;
          let next = curId ? cams.find((c) => c.deviceId !== curId) : null;
          if (!next) {
            const wantBack = target === 'environment';
            next =
              cams.find((c) => {
                const l = (c.label || '').toLowerCase();
                const isBack = l.includes('back') || l.includes('rear') || l.includes('environment');
                return wantBack ? isBack : !isBack;
              }) ||
              cams.find((c) => c.deviceId !== curId) ||
              cams[0];
          }
          if (next?.deviceId) {
            newTrack = await tryVideo({ video: { deviceId: { exact: next.deviceId } }, audio: false });
          }
        }
      } catch {
        // enumerateDevices can throw on insecure context — fall through to facingMode
      }

      // 2) facingMode with ideal (soft — never throws Overconstrained on most browsers).
      if (!newTrack) {
        newTrack = await tryVideo({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: target } },
          audio: false,
        } as MediaStreamConstraints);
      }

      // 3) Plain video (any camera) — last resort, still audio:false.
      if (!newTrack && lastErr && (lastErr.name === 'OverconstrainedError' || lastErr.name === 'NotFoundError')) {
        newTrack = await tryVideo({ video: true, audio: false } as MediaStreamConstraints);
      }

      if (!newTrack) {
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          if (devs.filter((d) => d.kind === 'videoinput').length === 1) {
            setPermissionError('Only one camera was found on this device.');
            return;
          }
        } catch {}
        throw lastErr ?? new Error('no track');
      }

      // Success: combine preserved audio with new video. Peer effect will replaceTrack.
      const old = streamRef.current!;
      old.getVideoTracks().forEach((t) => { try { t.stop(); } catch {} });
      if (tmp) tmp.getTracks().forEach((t) => { if (t !== newTrack) try { t.stop(); } catch {} });
      newTrack.enabled = cameraEnabledRef.current;
      audios.forEach((t) => { try { t.enabled = micEnabledRef.current; } catch {} });
      const combined = new MediaStream([...audios, newTrack]);
      streamRef.current = combined;
      setStream(combined);
      setFacing(target);
    } catch (e) {
      const err = e as DOMException;
      console.warn('[jendcore] flip failed', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError' || err?.name === 'PermissionDeniedError') {
        setPermissionError('Camera access was blocked. Please allow camera access in your browser settings and try again.');
      } else if (err?.name === 'NotFoundError') {
        setPermissionError('No camera was found for switching. Check that a camera is connected.');
      } else if (err?.name === 'NotReadableError') {
        setPermissionError('Camera is already in use by another app or tab. Close the other app and try again.');
      } else if (err?.name === 'OverconstrainedError') {
        setPermissionError('This device cannot switch to the requested camera.');
      } else if (err?.name === 'AbortError') {
        setPermissionError('Camera switch was interrupted. Please try again.');
      } else if ((err as unknown as Error)?.message?.includes('Only one camera')) {
        // already handled above
      } else {
        setPermissionError('Could not switch camera. Please try again.');
      }
    } finally { setBusy(false); }
  }, [acquire, facing]);

  return {
    stream,
    micEnabled,
    cameraEnabled,
    facing,
    permissionError,
    busy,
    toggleMic,
    toggleCamera,
    flipCamera,
    stop,
  };
}
