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
 * - One application data channel (`jendcore:doc`) for shared-document bytes:
 *   additive, initiator-created, ordered, with backpressure — the media path is
 *   untouched by it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

declare global {
  interface Window {
    /** Time-to-connected of the last successful peer connection, in ms. Debug aid. */
    __jendcoreLastConnectMs?: number;
  }
}

export type SignalKind =
  | 'offer'
  | 'answer'
  | 'candidate'
  | 'bye'
  | 'hello'
  | 'sharing'
  | 'media-state'
  /**
   * Application data that is not part of session signalling: shared-document
   * metadata, annotations, page changes and lifecycle events. It rides the same
   * broadcast channel with the same envelope shape, so the transport needs no
   * new capability for it. Document *bytes* deliberately do not travel here.
   */
  | 'doc';

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
  /**
   * Direct peer-to-peer byte channel for shared-document transfer.
   *
   * Additive and independent of the media path: it is created once per peer
   * connection (deterministically, by the initiator), carries no media, and its
   * failure never changes `connectionState`. `send` resolves only once the frame
   * is handed to the channel (waiting for the buffer to drain when the link is
   * busy), which is what makes transfer progress honest rather than optimistic.
   */
  dataChannel: DataChannelControls;
}

export type DataChannelState = 'connecting' | 'open' | 'closing' | 'closed';

export interface DataChannelControls {
  readyState: DataChannelState;
  /** Queues one frame. Resolves `false` if the channel is closed or wedged. */
  send: (payload: string | ArrayBuffer) => Promise<boolean>;
  /** Receives every inbound frame; returns an unsubscribe function. */
  subscribe: (handler: (payload: string | ArrayBuffer) => void) => () => void;
  /** Bytes queued but not yet flushed by the browser. */
  bufferedAmount: () => number;
}

/** Label of the application data channel (one per peer connection). */
const DATA_CHANNEL_LABEL = 'jendcore:doc';
/** Only queue more once the browser has drained below this. */
const DATA_HIGH_WATER = 512 * 1024;
const DATA_LOW_WATER = 128 * 1024;
/** A wedged channel must not hang a transfer forever. */
const DATA_SEND_TIMEOUT_MS = 20_000;

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  try {
    const env = import.meta.env;
    const urlsRaw: string | undefined = env.VITE_TURN_URLS;
    const username: string | undefined = env.VITE_TURN_USERNAME;
    const credential: string | undefined = env.VITE_TURN_CREDENTIAL;
    if (urlsRaw) {
      const urls = urlsRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (urls.length) {
        const entry: RTCIceServer = { urls: urls.length === 1 ? urls[0] : urls };
        if (username) entry.username = username;
        if (credential) entry.credential = credential;
        servers.push(entry);
      }
    }
  } catch {}
  return servers;
}
const ICE_SERVERS: RTCIceServer[] = buildIceServers();

// Bounded ICE-restart retry policy. A healthy 'connected' state resets the
// budget so a later, unrelated drop still gets a fresh set of attempts.
const ICE_RESTART_BASE_DELAY_MS = 1200;
const ICE_RESTART_MAX_DELAY_MS = 10_000;
const MAX_ICE_RESTART_ATTEMPTS = 5;

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
  const restartAttemptsRef = useRef(0);
  const connectStartRef = useRef<number | null>(null);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  /* ── application data channel (shared documents) ── */

  const dcRef = useRef<RTCDataChannel | null>(null);
  const dcListenersRef = useRef<Set<(payload: string | ArrayBuffer) => void>>(new Set());
  const [dataChannelState, setDataChannelState] = useState<DataChannelState>('closed');

  /** Detaches and closes the data channel, clearing every handler with it. */
  const detachDataChannel = useCallback(() => {
    const dc = dcRef.current;
    dcRef.current = null;
    if (dc) {
      dc.onopen = null;
      dc.onclose = null;
      dc.onerror = null;
      dc.onmessage = null;
      dc.onbufferedamountlow = null;
      try {
        dc.close();
      } catch {
        /* already closed */
      }
    }
    setDataChannelState('closed');
  }, []);

  /** Wires one channel — created here, or received from the other participant. */
  const bindDataChannel = useCallback((dc: RTCDataChannel) => {
    dcRef.current = dc;
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = DATA_LOW_WATER;
    setDataChannelState(dc.readyState === 'open' ? 'open' : 'connecting');
    dc.onopen = () => {
      if (dcRef.current === dc) setDataChannelState('open');
    };
    dc.onclose = () => {
      if (dcRef.current === dc) {
        dcRef.current = null;
        setDataChannelState('closed');
      }
    };
    dc.onerror = () => {
      // A data-channel error never changes the media `connectionState`: the call
      // keeps working even if document transfer is unavailable.
      if (isDebug()) console.warn('[jendcore] data channel error');
    };
    dc.onmessage = (event: MessageEvent) => {
      const data = event.data as unknown;
      const payload = typeof data === 'string' ? data : data instanceof ArrayBuffer ? data : null;
      if (payload === null) return;
      dcListenersRef.current.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          if (isDebug()) console.warn('[jendcore] data listener failed', err);
        }
      });
    };
  }, []);

  /**
   * Queues one frame, resolving once the browser has accepted it.
   *
   * Backpressure: while the channel is above the high-water mark the send waits
   * for `bufferedamountlow`, so a large document cannot balloon browser memory.
   * The transfer loop awaits each part, so only one waiter exists per channel.
   */
  const sendData = useCallback((payload: string | ArrayBuffer): Promise<boolean> => {
    const dc = dcRef.current;
    if (!dc) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(ok);
      };
      const timer = window.setTimeout(() => settle(false), DATA_SEND_TIMEOUT_MS);
      const attempt = () => {
        if (settled) return;
        const channel = dcRef.current;
        if (!channel || channel !== dc) {
          settle(false);
          return;
        }
        if (channel.readyState === 'connecting') {
          window.setTimeout(attempt, 120);
          return;
        }
        if (channel.readyState !== 'open') {
          settle(false);
          return;
        }
        if (channel.bufferedAmount > DATA_HIGH_WATER) {
          channel.onbufferedamountlow = () => {
            channel.onbufferedamountlow = null;
            attempt();
          };
          return;
        }
        try {
          // `RTCDataChannel.send` is overloaded per payload type, so the union
          // is narrowed here instead of being passed through (which no single
          // overload accepts).
          if (typeof payload === 'string') channel.send(payload);
          else channel.send(payload);
          settle(true);
        } catch {
          settle(false);
        }
      };
      attempt();
    });
  }, []);

  const subscribeData = useCallback((handler: (payload: string | ArrayBuffer) => void) => {
    dcListenersRef.current.add(handler);
    return () => {
      dcListenersRef.current.delete(handler);
    };
  }, []);

  const dataChannel = useMemo<DataChannelControls>(
    () => ({
      readyState: dataChannelState,
      send: sendData,
      subscribe: subscribeData,
      bufferedAmount: () => dcRef.current?.bufferedAmount ?? 0,
    }),
    [dataChannelState, sendData, subscribeData],
  );

  // Reset PC when remoteId switches from placeholder to real peer
  const prevRemoteRef = useRef<string>(remoteId);
  useEffect(() => {
    if (prevRemoteRef.current !== remoteId) {
      if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
      // The byte channel belonged to the previous peer connection.
      detachDataChannel();
      remoteStreamRef.current = null;
      pendingCandidatesRef.current = [];
      setRemoteStream(null);
      setConnectionState(remoteId === '__no_remote__' ? 'idle' : 'connecting');
      prevRemoteRef.current = remoteId;
      connectStartRef.current = remoteId !== '__no_remote__' ? Date.now() : null;
    }
  }, [remoteId, detachDataChannel]);

  const close = useCallback(() => {
    if (restartTimeoutRef.current) { try { window.clearTimeout(restartTimeoutRef.current); } catch {} restartTimeoutRef.current = null; }
    // The byte channel dies with the peer connection: handlers cleared, then closed.
    detachDataChannel();
    const pc = pcRef.current;
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onicegatheringstatechange = null;
      pc.onnegotiationneeded = null;
      pc.close();
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
  }, [detachDataChannel]);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current; if (!pc || !pc.remoteDescription) return;
    const queued = pendingCandidatesRef.current.splice(0);
    for (const c of queued) { try { await pc.addIceCandidate(c); } catch (e) { if (isDebug()) console.warn('[jendcore] flush candidate failed', e); } }
  }, []);
  const scheduleIceRestart = useCallback(() => {
    const pc = pcRef.current; if (!pc) return; if (restartTimeoutRef.current) return;
    if (restartAttemptsRef.current >= MAX_ICE_RESTART_ATTEMPTS) {
      if (isDebug()) console.warn('[jendcore] ICE restart budget exhausted; waiting for the network to recover');
      return;
    }
    // Bounded exponential backoff: 1.2s, 2.4s, 4.8s, 9.6s, then 10s.
    const delay = Math.min(ICE_RESTART_BASE_DELAY_MS * 2 ** restartAttemptsRef.current, ICE_RESTART_MAX_DELAY_MS);
    restartAttemptsRef.current += 1;
    if (isDebug()) console.warn(`[jendcore] scheduling ICE restart attempt ${restartAttemptsRef.current} in ${delay}ms`);
    restartTimeoutRef.current = window.setTimeout(() => {
      restartTimeoutRef.current = null; const p = pcRef.current; if (!p) return;
      if (p.connectionState === 'failed' || p.connectionState === 'disconnected' || p.iceConnectionState === 'failed') {
        try { p.restartIce(); if (isDebug()) console.warn('[jendcore] restartIce called'); } catch (e) { if (isDebug()) console.warn('[jendcore] restartIce error', e); }
      }
    }, delay);
  }, []);

  // Wire up a fresh RTCPeerConnection.
  const setup = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    if (remoteId === '__no_remote__') return null as unknown as RTCPeerConnection;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    pcRef.current = pc;
    /*
     * One application data channel per peer connection, created deterministically
     * by the initiator so it is present in the very first offer and both sides
     * agree on which channel is the document channel. This is an additional,
     * independent transport on the same connection: no media track is touched,
     * `bundlePolicy` is unchanged, and a failure here never alters the call.
     */
    if (initiator) {
      try {
        bindDataChannel(pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true }));
      } catch (err) {
        if (isDebug()) console.warn('[jendcore] could not create data channel', err);
      }
    }
    pc.ondatachannel = (event: RTCDataChannelEvent) => {
      if (event.channel.label !== DATA_CHANNEL_LABEL) return;
      bindDataChannel(event.channel);
    };
    if (connectStartRef.current === null) connectStartRef.current = Date.now();
    pc.onconnectionstatechange = () => {
      const map: Record<RTCPeerConnectionState, ConnectionState> = {
        new: 'connecting', connecting: 'connecting', connected: 'connected',
        disconnected: 'disconnected', failed: 'failed', closed: 'closed',
      };
      const next = map[pc.connectionState] ?? 'connecting';
      setConnectionState(next);
      if (isDebug()) console.debug('[jendcore] pc', pc.connectionState, 'ice', pc.iceConnectionState, 'gather', pc.iceGatheringState);
      if (next === 'connected' && connectStartRef.current) {
        const ms = Date.now() - connectStartRef.current; if (isDebug()) console.debug(`[jendcore] time-to-connected ${ms}ms`);
        try { window.__jendcoreLastConnectMs = ms; } catch {}
      }
      if (pc.connectionState === 'failed') scheduleIceRestart();
      else if (pc.connectionState === 'disconnected') {
        if (!restartTimeoutRef.current) restartTimeoutRef.current = window.setTimeout(() => {
          restartTimeoutRef.current = null;
          if (pcRef.current && pcRef.current.connectionState === 'disconnected') scheduleIceRestart();
        }, 3000) as unknown as number;
      } else if (pc.connectionState === 'connected') {
        // A healthy connection resets the retry budget for any future drop.
        restartAttemptsRef.current = 0;
        if (restartTimeoutRef.current) { window.clearTimeout(restartTimeoutRef.current); restartTimeoutRef.current = null; }
      }
    };
    pc.oniceconnectionstatechange = () => {
      const ice = pc.iceConnectionState;
      if (isDebug()) console.debug('[jendcore] iceConnectionState', ice);
      if (ice === 'failed') scheduleIceRestart();
    };
    pc.onicegatheringstatechange = () => { if (isDebug()) console.debug('[jendcore] iceGatheringState', pc.iceGatheringState); };

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
  }, [selfId, remoteId, send, localStream, scheduleIceRestart, initiator, bindDataChannel]);

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
        try { p.onnegotiationneeded?.(new Event('negotiationneeded')); } catch {}
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

  return { connectionState, remoteStream, dataChannel };
}
