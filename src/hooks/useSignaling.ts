/**
 * Session signalling transport.
 *
 * In V1 (before Supabase is wired up) we use a BroadcastChannel so the
 * app works fully end-to-end between two tabs / windows on the same
 * device for development and QA. The public surface — `send`,
 * `subscribe`, `peers`, `join`, `leave` — is identical to the one a
 * Supabase Realtime channel will expose, so swapping the backend is a
 * one-file change.
 *
 * Each peer announces itself with a `hello` message on join and
 * announces departure with `bye`. The "initiator" role is given to the
 * peer that arrived first (lowest selfId among currently-present peers).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Resolve to the remote peer id once exactly one other peer is present. */
  waitForPeer: () => Promise<string>;
}

const CHANNEL_PREFIX = 'jendcore:session:';

export function useSignaling(sessionId: string): SignalingControls {
  const [selfId] = useState(() => cryptoRandomId());
  const [peers, setPeers] = useState<Peer[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const listenersRef = useRef<Set<(env: SignalEnvelope) => void>>(new Set());

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[jendcore] BroadcastChannel unavailable in this browser.');
      return;
    }
    const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${sessionId}`);
    channelRef.current = channel;

    const onMessage = (event: MessageEvent<SignalEnvelope>) => {
      const env = event.data;
      if (!env || typeof env !== 'object') return;
      // Refresh peer registry on hello / bye.
      if (env.kind === 'hello') {
        const payload = env.payload as HelloPayload;
        setPeers((prev) => {
          if (prev.some((p) => p.id === env.from)) return prev;
          return [...prev, { id: env.from, joinedAt: payload.joinedAt }];
        });
      }
      if (env.kind === 'bye') {
        setPeers((prev) => prev.filter((p) => p.id !== env.from));
      }
      listenersRef.current.forEach((cb) => cb(env));
    };
    channel.addEventListener('message', onMessage);

    // Announce ourselves.
    channel.postMessage({
      from: selfId,
      to: '*',
      kind: 'hello',
      payload: { joinedAt: Date.now() },
    } satisfies SignalEnvelope);

    return () => {
      try {
        channel.postMessage({
          from: selfId,
          to: '*',
          kind: 'bye',
        } satisfies SignalEnvelope);
      } catch {
        // ignore
      }
      channel.removeEventListener('message', onMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [sessionId, selfId]);

  const send = useCallback(
    (env: SignalEnvelope) => {
      channelRef.current?.postMessage(env);
    },
    [],
  );

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
          // If multiple (shouldn't happen in V1 but possible during testing),
          // pick the lowest id for determinism.
          others.sort((a, b) => (a.id < b.id ? -1 : 1));
          resolve(others[0].id);
        }
      };
      check();
      const id = setInterval(check, 200);
      // Safety: stop polling after 2 minutes.
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
