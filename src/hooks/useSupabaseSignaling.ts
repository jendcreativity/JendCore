/**
 * Supabase Realtime signalling transport.
 *
 * This hook replaces BroadcastChannel with Supabase Realtime for cross-device
 * communication. The public surface is identical to useSignaling so swapping
 * between local (BroadcastChannel) and remote (Supabase) is seamless.
 *
 * Supabase Realtime uses PostgreSQL's LISTEN/NOTIFY under the hood, which
 * means all peers in the same session automatically receive broadcast messages.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
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

/**
 * Supabase-backed signalling. Falls back gracefully if Supabase is not configured.
 */
export function useSupabaseSignaling(sessionId: string): SignalingControls {
  const [selfId] = useState(() => cryptoRandomId());
  const [peers, setPeers] = useState<Peer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listenersRef = useRef<Set<(env: SignalEnvelope) => void>>(new Set());
  const subscriptionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[jendcore] Supabase not configured; signalling unavailable.');
      return;
    }

    const channelName = `${CHANNEL_PREFIX}${sessionId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    });

    channelRef.current = channel;

    // Listen for messages from peers
    const subscription = channel
      .on('broadcast', { event: 'signal' }, (payload) => {
        const env = payload.payload as SignalEnvelope;
        if (!env || typeof env !== 'object') return;

        // Update peer registry on hello/bye
        if (env.kind === 'hello') {
          const payload_data = env.payload as HelloPayload;
          setPeers((prev) => {
            if (prev.some((p) => p.id === env.from)) return prev;
            return [...prev, { id: env.from, joinedAt: payload_data.joinedAt }];
          });
        }

        if (env.kind === 'bye') {
          setPeers((prev) => prev.filter((p) => p.id !== env.from));
        }

        // Notify all subscribers
        listenersRef.current.forEach((cb) => cb(env));
      })
      .subscribe(async (status) => {
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

    subscriptionRef.current = subscription;

    return () => {
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

      supabase.removeChannel(channel);
      subscriptionRef.current = null;
    };
  }, [sessionId, selfId]);

  const send = useCallback((env: SignalEnvelope) => {
    const channel = channelRef.current;
    if (!channel) {
      console.warn('[jendcore] Signalling channel not ready');
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
    [],
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
      // Safety: stop polling after 2 minutes
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
