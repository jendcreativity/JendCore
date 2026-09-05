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
        } else if (
          e.name === 'NotFoundError' ||
          e.name === 'OverconstrainedError'
        ) {
          setPermissionError(
            'No camera or microphone was found on this device.',
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
    const target: CameraFacing =
      facing === 'user' ? 'environment' : 'user';
    await acquire(target);
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
