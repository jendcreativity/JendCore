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
}

const CHANNEL_PREFIX = 'jendcore:session:';

export function useSupabaseSignaling(sessionId: string): SignalingControls {
  const [selfId] = useState(() => cryptoRandomId());
  const [peers, setPeers] = useState<Peer[]>([]);
  const channelRef = useRef<any>(null);
  const listenersRef = useRef<Set<(env: SignalEnvelope) => void>>(new Set());
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn(
        '[jendcore] Supabase not configured; signalling unavailable'
      );
      return;
    }

    const channelName = `${CHANNEL_PREFIX}${sessionId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: true },
      },
    });

    channelRef.current = channel;

    channel.on('broadcast', { event: 'signal' }, (payload: any) => {
      const env = payload.payload as SignalEnvelope;
      if (!env || typeof env !== 'object') return;

      // Refresh peer registry on hello / bye
      if (env.kind === 'hello') {
        const helloPayload = env.payload as HelloPayload;
        setPeers((prev) => {
          if (prev.some((p) => p.id === env.from)) return prev;
          return [...prev, { id: env.from, joinedAt: helloPayload.joinedAt }];
        });
      }
      if (env.kind === 'bye') {
        setPeers((prev) => prev.filter((p) => p.id !== env.from));
      }

      // Notify all listeners
      listenersRef.current.forEach((cb) => cb(env));
    });

    // Subscribe to the channel
    subscriptionRef.current = channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        // Announce ourselves
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            from: selfId,
            to: '*',
            kind: 'hello',
            payload: { joinedAt: Date.now() },
          } satisfies SignalEnvelope,
        });
      }
    });

    return () => {
      try {
        // Announce departure
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            from: selfId,
            to: '*',
            kind: 'bye',
          } satisfies SignalEnvelope,
        });
      } catch {
        // ignore
      }

      // Cleanup
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
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
        const others = peers.filter((p) => p.id !== selfId);
        if (others.length > 0) {
          others.sort((a, b) => (a.id < b.id ? -1 : 1));
          resolve(others[0].id);
        }
      };
      check();
      const id = setInterval(check, 200);
      setTimeout(() => clearInterval(id), 120_000);
    });
  }, [peers, selfId]);

  return { selfId, peers, send, subscribe, waitForPeer };
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
