/**
 * Supabase Realtime signaling transport.
 *
 * Uses Supabase Realtime broadcast channels for peer-to-peer signaling.
 * Each session gets its own channel (e.g., 'jendcore:session:JC-XXXX-XXXX').
 *
 * Messages flow:
 * - WebRTC offer/answer/ICE candidates
 * - Annotations
 * - Chat messages
 *
 * Works cross-device (laptop ↔ phone, browser ↔ browser).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { SignalEnvelope } from './usePeerConnection';

export interface Peer {
  id: string;
  joinedAt: number;
}

interface HelloPayload {
  joinedAt: number;
}

export interface SignalingControls {
  selfId: string;
  peers: Peer[];
  send: (env: SignalEnvelope) => void;
  subscribe: (handler: (env: SignalEnvelope) => void) => () => void;
  waitForPeer: () => Promise<string>;
  /**
   * Human-readable reason the transport cannot pair devices, or null when
   * healthy. The UI shows this instead of waiting silently forever.
   */
  error: string | null;
}

const CHANNEL_PREFIX = 'jendcore:session:';

/** Shown when this build has no Supabase configuration at all. */
const SIGNALING_UNAVAILABLE_MESSAGE =
  'Real-time signalling is unavailable: this build has no Supabase configuration, so devices cannot pair. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then reload.';

/** Shown when the Supabase Realtime channel fails or times out. */
const SIGNALING_CHANNEL_ERROR_MESSAGE =
  'The real-time signalling channel could not be reached. Check the network connection on this device; devices cannot pair until it recovers.';

export function useSupabaseSignaling(sessionId: string): SignalingControls {
  const [selfId] = useState(() => cryptoRandomId());
  const [peers, setPeers] = useState<Peer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  const listenersRef = useRef<Set<(env: SignalEnvelope) => void>>(new Set());
  const subscriptionRef = useRef<any>(null);
  const peersRef = useRef<Peer[]>([]);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn(
        '[jendcore] Supabase not configured; signalling unavailable'
      );
      setError(SIGNALING_UNAVAILABLE_MESSAGE);
      return;
    }

    const channelName = `${CHANNEL_PREFIX}${sessionId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: true },
      },
    });

    channelRef.current = channel;

    const sendHello = () => {
      try {
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { from: selfId, to: '*', kind: 'hello', payload: { joinedAt: Date.now() } } satisfies SignalEnvelope,
        });
      } catch {}
    };

    channel.on('broadcast', { event: 'signal' }, (payload: any) => {
      const env = payload.payload as SignalEnvelope;
      if (!env || typeof env !== 'object') return;
      if (env.kind === 'hello') {
        if (env.from === selfId) return;
        const helloPayload = env.payload as HelloPayload;
        let isNew = false;
        setPeers((prev) => {
          if (prev.some((p) => p.id === env.from)) return prev;
          isNew = true;
          return [...prev, { id: env.from, joinedAt: helloPayload.joinedAt }];
        });
        // Ack new peer — ensures late joiner sees us even if they missed our first hello
        if (isNew) {
          try { window.setTimeout(() => sendHello(), 120); } catch {}
        }
      }
      if (env.kind === 'bye') setPeers((prev) => prev.filter((p) => p.id !== env.from));
      listenersRef.current.forEach((cb) => cb(env));
    });

    let helloTimer: number | null = null;
    let helloTries = 0;
    subscriptionRef.current = channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        setError(null);
        sendHello();
        // Retransmit until a peer appears or timeout — fixes missed broadcast on cross-device join
        helloTimer = window.setInterval(() => {
          helloTries += 1;
          if (peersRef.current.length > 0 || helloTries > 8) {
            if (helloTimer) window.clearInterval(helloTimer);
            helloTimer = null; return;
          }
          sendHello();
        }, 900) as unknown as number;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[jendcore] signalling channel status', status);
        setError(SIGNALING_CHANNEL_ERROR_MESSAGE);
      }
    });

    return () => {
      try { if (helloTimer) window.clearInterval(helloTimer); } catch {}
      try {
        channel.send({
          type: 'broadcast', event: 'signal',
          payload: { from: selfId, to: '*', kind: 'bye' } satisfies SignalEnvelope,
        });
      } catch {}
      if (subscriptionRef.current) { supabase.removeChannel(subscriptionRef.current); subscriptionRef.current = null; }
      channelRef.current = null;
    };
  }, [sessionId, selfId]);

  const send = useCallback((env: SignalEnvelope) => {
    const channel = channelRef.current;
    if (!channel) {
      console.warn('[jendcore] Signaling channel not ready');
      return;
    }

    channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: env,
    });
  }, []);

  const subscribe = useCallback(
    (handler: (env: SignalEnvelope) => void) => {
      listenersRef.current.add(handler);
      return () => {
        listenersRef.current.delete(handler);
      };
    },
    []
  );

  const waitForPeer = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const check = () => {
        const others = peersRef.current.filter((p) => p.id !== selfId);
        if (others.length > 0) {
          others.sort((a, b) => (a.id < b.id ? -1 : 1));
          resolve(others[0].id);
          return true;
        }
        return false;
      };
      if (check()) return;
      const id = setInterval(() => {
        if (check()) clearInterval(id);
      }, 200);
      setTimeout(() => clearInterval(id), 120_000);
    });
  }, [selfId]);

  return { selfId, peers, send, subscribe, waitForPeer, error };
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
