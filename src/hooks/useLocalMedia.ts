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
      if (!streamRef.current) { await acquire(target); return; }
      let newTrack: MediaStreamTrack | null = null;
      let tmp: MediaStream | null = null;
      let flipError: DOMException | null = null;
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const cams = devs.filter((d) => d.kind === 'videoinput');
        if (cams.length === 1) {
          setPermissionError('Only one camera was found on this device.');
          setBusy(false);
          return;
        }
        if (cams.length >= 2) {
          const cur = streamRef.current.getVideoTracks()[0];
          const curId = (cur?.getSettings?.().deviceId as string) || null;
          let next = curId ? cams.find((c) => c.deviceId !== curId) : null;
          if (!next) {
            const wantBack = target === 'environment';
            next = cams.find((c) => {
              const l = (c.label || '').toLowerCase();
              const isBack = l.includes('back') || l.includes('rear') || l.includes('environment');
              return wantBack ? isBack : !isBack;
            }) || cams.find((c) => c.deviceId !== curId) || cams[0];
          }
          if (next?.deviceId) {
            try {
              tmp = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } }, audio: false });
              newTrack = tmp.getVideoTracks()[0] || null;
            } catch (err) {
              flipError = err as DOMException;
            }
          }
        }
      } catch {}
      if (!newTrack) {
        try {
          tmp = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: target } },
            audio: false,
          });
          newTrack = tmp.getVideoTracks()[0] || null;
          flipError = null;
        } catch (err) {
          flipError = err as DOMException;
          // Do not re-request microphone — that would interrupt audio.
          // Only fall back to acquire (which requests audio) if the error indicates no matching camera.
          if (flipError?.name === 'OverconstrainedError' || flipError?.name === 'NotFoundError') {
            // Last resort: try acquire with same audio constraint handling
            await acquire(target);
            return;
          }
          throw flipError;
        }
      }
      if (!newTrack) throw flipError ?? new Error('no track');
      const old = streamRef.current;
      const audios = old.getAudioTracks().slice();
      old.getVideoTracks().forEach((t) => t.stop());
      if (tmp) tmp.getTracks().forEach((t) => { if (t !== newTrack) t.stop(); });
      newTrack.enabled = cameraEnabledRef.current;
      audios.forEach((t) => (t.enabled = micEnabledRef.current));
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
      } else if (err?.message?.includes('Only one camera')) {
        // already handled above — keep existing message
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
