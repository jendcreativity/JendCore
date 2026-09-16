/**
 * WebRTC peer-connection hook — hardened.
 *
 * Preserves 524fdcc true-orientation contract: NO mirror, NO MediaStream
 * mutation. All changes are transport/ICE/signaling only.
 *
 * Hardening:
 * - Trickle ICE preserved (onicecandidate -> send candidate).
 * - STUN: two Google STUNs. Optional TURN from env VITE_TURN_URLS /
 *   VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL (if set, appended).
 * - Early ICE candidate buffering, polite glare fix, ICE restart.
 * - replaceTrack for camera flip, coherent remote MediaStream.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type SignalKind = 'offer' | 'answer' | 'candidate' | 'bye' | 'hello' | 'sharing' | 'media-state';

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

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  try {
    const env: any = (import.meta as any).env ?? {};
    const urlsRaw: string | undefined = env.VITE_TURN_URLS;
    const username: string | undefined = env.VITE_TURN_USERNAME;
    const credential: string | undefined = env.VITE_TURN_CREDENTIAL;
    if (urlsRaw) {
      const urls = urlsRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (urls.length) {
        const entry: RTCIceServer = { urls: urls.length === 1 ? urls[0] : urls } as RTCIceServer;
        if (username) (entry as any).username = username;
        if (credential) (entry as any).credential = credential;
        servers.push(entry);
      }
    }
  } catch {}
  return servers;
}
const ICE_SERVERS: RTCIceServer[] = buildIceServers();
function isDebug(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem('jendcore:debug') === '1'; } catch { return false; }
}

export function usePeerConnection(
  opts: UsePeerConnectionOptions,
): PeerConnectionControls {
  const { selfId, remoteId, initiator, send, subscribe, localStream } = opts;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const restartTimeoutRef = useRef<number | null>(null);
  const connectStartRef = useRef<number | null>(null);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Reset PC when remoteId switches from placeholder to real peer
  const prevRemoteRef = useRef<string>(remoteId);
  useEffect(() => {
    if (prevRemoteRef.current !== remoteId) {
      if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
      remoteStreamRef.current = null;
      pendingCandidatesRef.current = [];
      setRemoteStream(null);
      setConnectionState(remoteId === '__no_remote__' ? 'idle' : 'connecting');
      prevRemoteRef.current = remoteId;
      connectStartRef.current = remoteId !== '__no_remote__' ? Date.now() : null;
    }
  }, [remoteId]);

  const close = useCallback(() => {
    if (restartTimeoutRef.current) { try { window.clearTimeout(restartTimeoutRef.current); } catch {} restartTimeoutRef.current = null; }
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      (pcRef.current as any).oniceconnectionstatechange = null;
      (pcRef.current as any).onicegatheringstatechange = null;
      pcRef.current.onnegotiationneeded = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current; if (!pc || !pc.remoteDescription) return;
    const queued = pendingCandidatesRef.current.splice(0);
    for (const c of queued) { try { await pc.addIceCandidate(c); } catch (e) { if (isDebug()) console.warn('[jendcore] flush candidate failed', e); } }
  }, []);
  const scheduleIceRestart = useCallback(() => {
    const pc = pcRef.current; if (!pc) return; if (restartTimeoutRef.current) return;
    if (isDebug()) console.warn('[jendcore] scheduling ICE restart');
    restartTimeoutRef.current = window.setTimeout(() => {
      restartTimeoutRef.current = null; const p = pcRef.current; if (!p) return;
      if (p.connectionState === 'failed' || p.connectionState === 'disconnected' || (p as any).iceConnectionState === 'failed') {
        try { p.restartIce(); if (isDebug()) console.warn('[jendcore] restartIce called'); } catch (e) { if (isDebug()) console.warn('[jendcore] restartIce error', e); }
      }
    }, 1200);
  }, []);

  // Wire up a fresh RTCPeerConnection.
  const setup = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    if (remoteId === '__no_remote__') return null as unknown as RTCPeerConnection;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    pcRef.current = pc;
    if (connectStartRef.current === null) connectStartRef.current = Date.now();
    pc.onconnectionstatechange = () => {
      const map: Record<RTCPeerConnectionState, ConnectionState> = {
        new: 'connecting', connecting: 'connecting', connected: 'connected',
        disconnected: 'disconnected', failed: 'failed', closed: 'closed',
      };
      const next = map[pc.connectionState] ?? 'connecting';
      setConnectionState(next);
      if (isDebug()) console.debug('[jendcore] pc', pc.connectionState, 'ice', (pc as any).iceConnectionState, 'gather', (pc as any).iceGatheringState);
      if (next === 'connected' && connectStartRef.current) {
        const ms = Date.now() - connectStartRef.current; if (isDebug()) console.debug(`[jendcore] time-to-connected ${ms}ms`);
        try { (window as any).__jendcoreLastConnectMs = ms; } catch {}
      }
      if (pc.connectionState === 'failed') scheduleIceRestart();
      else if (pc.connectionState === 'disconnected') {
        if (!restartTimeoutRef.current) restartTimeoutRef.current = window.setTimeout(() => {
          restartTimeoutRef.current = null;
          if (pcRef.current && pcRef.current.connectionState === 'disconnected') scheduleIceRestart();
        }, 3000) as unknown as number;
      } else if (pc.connectionState === 'connected' && restartTimeoutRef.current) {
        window.clearTimeout(restartTimeoutRef.current); restartTimeoutRef.current = null;
      }
    };
    (pc as any).oniceconnectionstatechange = () => {
      const ice = (pc as any).iceConnectionState as string | undefined;
      if (isDebug() && ice) console.debug('[jendcore] iceConnectionState', ice);
      if (ice === 'failed') scheduleIceRestart();
    };
    (pc as any).onicegatheringstatechange = () => { if (isDebug()) console.debug('[jendcore] iceGatheringState', (pc as any).iceGatheringState); };

    pc.ontrack = (event) => {
      // Prefer the coherent stream from the event (keeps audio+video in sync).
      // Merge tracks if the same stream id arrives in multiple ontrack callbacks.
      const inbound = event.streams[0];
      const track = event.track;
      if (inbound) {
        const existing = remoteStreamRef.current;
        if (existing && existing.id === inbound.id) {
          if (track && !existing.getTracks().some((t) => t.id === track.id)) {
            try { existing.addTrack(track); } catch {}
            setRemoteStream(existing);
          }
          return;
        }
        remoteStreamRef.current = inbound;
        setRemoteStream(inbound);
        return;
      }
      // Fallback: track without stream (some browsers)
      if (track) {
        let rs = remoteStreamRef.current;
        if (!rs) {
          rs = new MediaStream([track]);
          remoteStreamRef.current = rs;
          setRemoteStream(rs);
        } else if (!rs.getTracks().some((t) => t.id === track.id)) {
          try { rs.addTrack(track); } catch {}
          setRemoteStream(rs);
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({ from: selfId, to: remoteId, kind: 'candidate', payload: event.candidate.toJSON() });
      } else if (isDebug()) console.debug('[jendcore] ICE gathering complete');
    };
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        const desc = pc.localDescription; if (!desc) return;
        send({ from: selfId, to: remoteId, kind: 'offer', payload: desc });
        if (isDebug()) console.debug('[jendcore] onnegotiationneeded -> offer');
      } catch (err) { console.error('[jendcore] negotiation failed', err); }
      finally { makingOfferRef.current = false; }
    };
    if (localStream) {
      for (const track of localStream.getTracks()) { try { pc.addTrack(track, localStream); } catch (e) { if (isDebug()) console.warn('[jendcore] addTrack failed', e); } }
    }
    return pc;
  }, [selfId, remoteId, send, localStream, scheduleIceRestart]);

  useEffect(() => {
    const pc = pcRef.current; if (!pc || !localStream) return;
    const senders = pc.getSenders();
    for (const track of localStream.getTracks()) {
      const existing = senders.find((s) => s.track?.kind === track.kind);
      if (existing) {
        if (existing.track?.id !== track.id) existing.replaceTrack(track).catch(() => undefined);
      } else { try { pc.addTrack(track, localStream); } catch {} }
    }
  }, [localStream]);

  // Handle incoming signals — lazy PC so ontrack is wired before first offer;
  // buffers early candidates; polite/impolite glare per perfect negotiation.
  useEffect(() => {
    const ensurePc = (): RTCPeerConnection | null => {
      if (pcRef.current) return pcRef.current;
      if (remoteId === '__no_remote__') return null;
      return setup();
    };
    const handler = async (env: SignalEnvelope) => {
      if (env.to !== selfId && env.to !== '*') return;
      if (env.from !== remoteId) return;
      const pc = ensurePc(); if (!pc) return;
      try {
        if (env.kind === 'offer') {
          const desc = env.payload as RTCSessionDescriptionInit;
          const offerCollision = makingOfferRef.current || pc.signalingState !== 'stable';
          const isImpolite = initiator;
          ignoreOfferRef.current = isImpolite && offerCollision;
          if (ignoreOfferRef.current) { if (isDebug()) console.debug('[jendcore] ignoring offer (glare, impolite)'); return; }
          await pc.setRemoteDescription(desc);
          await flushPendingCandidates();
          await pc.setLocalDescription();
          const answer = pc.localDescription; if (!answer) return;
          send({ from: selfId, to: remoteId, kind: 'answer', payload: answer });
        } else if (env.kind === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(env.payload as RTCSessionDescriptionInit);
            await flushPendingCandidates();
          } else if (isDebug()) console.debug('[jendcore] ignoring stale answer', pc.signalingState);
        } else if (env.kind === 'candidate') {
          const cand = env.payload as RTCIceCandidateInit;
          if (!pc.remoteDescription) { pendingCandidatesRef.current.push(cand); if (isDebug()) console.debug('[jendcore] buffering early candidate'); return; }
          try { await pc.addIceCandidate(cand); } catch (err) { if (!ignoreOfferRef.current) throw err; if (isDebug()) console.debug('[jendcore] suppress candidate (ignored offer)', err); }
        } else if (env.kind === 'bye') { close(); setConnectionState('closed'); }
      } catch (err) { console.error('[jendcore] signal handling error', err); }
    };
    const unsub = subscribe(handler);
    if (remoteId !== '__no_remote__') ensurePc();
    return unsub;
  }, [setup, subscribe, send, selfId, remoteId, initiator, close, flushPendingCandidates]);

  useEffect(() => {
    if (!initiator) return; if (remoteId === '__no_remote__') return;
    const pc = setup(); if (!pc) return; if (pc.signalingState !== 'stable') return;
    if (pc.getSenders().length > 0 && !pc.currentLocalDescription) {
      const t = window.setTimeout(() => {
        const p = pcRef.current; if (!p || p.signalingState !== 'stable') return;
        try { p.onnegotiationneeded?.(new Event('negotiationneeded') as any); } catch {}
      }, 0) as unknown as number;
      return () => window.clearTimeout(t);
    }
  }, [initiator, remoteId, setup]);

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
