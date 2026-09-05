/**
 * WebRTC peer-connection hook.
 *
 * Architecture (V1):
 *   - Two-person mesh: each side has one RTCPeerConnection.
 *   - One side is the "polite" peer (waits for a duplicate offer to avoid
 *     the well-known glare problem when both peers start at once).
 *   - Signalling payloads (offer / answer / ICE candidates) are passed
 *     through a transport injected by the caller — this keeps the hook
 *     usable against Supabase Realtime, a custom WebSocket, or even a
 *     local BroadcastChannel for in-tab testing.
 *
 * The hook intentionally owns the local MediaStream so that mic/camera
 * toggles are reflected on the wire without renegotiation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type SignalKind = 'offer' | 'answer' | 'candidate' | 'bye' | 'hello';

export interface SignalEnvelope {
  /** Which peer sent this message. */
  from: string;
  /** Which peer should receive it. '*' means broadcast. */
  to: string;
  kind: SignalKind;
  payload?: unknown;
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface UsePeerConnectionOptions {
  /** Stable identity for the local peer. Used for signal routing. */
  selfId: string;
  /** Remote peer id. The hook ignores envelopes not addressed here. */
  remoteId: string;
  /** Whether the local peer should initiate the offer. */
  initiator: boolean;
  /** Outgoing signal transport. */
  send: (envelope: SignalEnvelope) => void;
  /** Subscribe to incoming signals. Returns an unsubscribe fn. */
  subscribe: (handler: (envelope: SignalEnvelope) => void) => () => void;
  /** Local media (camera + mic). The hook uses this as the senders' source. */
  localStream: MediaStream | null;
}

export interface PeerConnectionControls {
  connectionState: ConnectionState;
  remoteStream: MediaStream | null;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function usePeerConnection(
  opts: UsePeerConnectionOptions,
): PeerConnectionControls {
  const { selfId, remoteId, initiator, send, subscribe, localStream } = opts;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Helper: tear down any existing connection.
  const close = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.onnegotiationneeded = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
  }, []);

  // Wire up a fresh RTCPeerConnection.
  const setup = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      const map: Record<RTCPeerConnectionState, ConnectionState> = {
        new: 'connecting',
        connecting: 'connecting',
        connected: 'connected',
        disconnected: 'disconnected',
        failed: 'failed',
        closed: 'closed',
      };
      setConnectionState(map[pc.connectionState] ?? 'connecting');

      // Simple auto-recovery: if it fails, attempt one ICE restart.
      if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) setRemoteStream(stream);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({
          from: selfId,
          to: remoteId,
          kind: 'candidate',
          payload: event.candidate.toJSON(),
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        send({
          from: selfId,
          to: remoteId,
          kind: 'offer',
          payload: pc.localDescription,
        });
      } catch (err) {
        console.error('[jendcore] negotiation failed', err);
      } finally {
        makingOfferRef.current = false;
      }
    };

    // Attach current local tracks.
    if (localStream) {
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }
    }

    return pc;
  }, [selfId, remoteId, send, localStream]);

  // (Re)attach tracks whenever the local stream changes.
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || !localStream) return;

    const senders = pc.getSenders();
    for (const track of localStream.getTracks()) {
      const existing = senders.find((s) => s.track?.kind === track.kind);
      if (existing) {
        existing.replaceTrack(track).catch(() => undefined);
      } else {
        pc.addTrack(track, localStream);
      }
    }
  }, [localStream]);

  // Handle incoming signals.
  useEffect(() => {
    const pc = setup();

    const handler = async (env: SignalEnvelope) => {
      if (env.to !== selfId && env.to !== '*') return;
      if (env.from !== remoteId) return;

      try {
        if (env.kind === 'offer') {
          const desc = env.payload as RTCSessionDescriptionInit;
          const offerCollision =
            makingOfferRef.current || pc.signalingState !== 'stable';
          ignoreOfferRef.current = !initiator && offerCollision;
          if (ignoreOfferRef.current) return;

          await pc.setRemoteDescription(desc);
          await pc.setLocalDescription();
          send({
            from: selfId,
            to: remoteId,
            kind: 'answer',
            payload: pc.localDescription,
          });
        } else if (env.kind === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(env.payload as RTCSessionDescriptionInit);
          }
        } else if (env.kind === 'candidate') {
          try {
            await pc.addIceCandidate(env.payload as RTCIceCandidateInit);
          } catch (err) {
            if (!ignoreOfferRef.current) throw err;
          }
        } else if (env.kind === 'bye') {
          close();
        }
      } catch (err) {
        console.error('[jendcore] signal handling error', err);
      }
    };

    return subscribe(handler);
  }, [setup, subscribe, send, selfId, remoteId, initiator, close]);

  // Initiator triggers negotiation as soon as the connection exists.
  useEffect(() => {
    if (!initiator) return;
    setup();
  }, [initiator, setup]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      try {
        send({ from: selfId, to: remoteId, kind: 'bye' });
      } catch {
        // ignore
      }
      close();
    };
  }, [close, send, selfId, remoteId]);

  return { connectionState, remoteStream };
}
