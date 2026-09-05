# Architecture

JendCore V1 is built as a single-page application (Vite + React +
TypeScript + Tailwind CSS) with WebRTC for media and a small
signalling/coordination layer.

The application is designed so that it can run **without a backend**
during development and progressively adopt server-side capabilities
without rewriting the front end.

---

## High-level overview

```
┌──────────────────────────────────────────────────────────────┐
│                       Browser (React)                        │
│                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│   │  useLocal   │    │ usePeer     │    │ AnnotationCanvas│  │
│   │   Media     │◀──▶│ Connection  │    │ + ChatPanel     │  │
│   └─────────────┘    └─────────────┘    └─────────────────┘  │
│           ▲                  ▲                    ▲          │
│           │                  │                    │          │
│           │           ┌──────┴────────┐           │          │
│           └──────────▶│  useSignaling │◀──────────┘          │
│                       └──────┬────────┘                      │
└──────────────────────────────┼───────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │   Transport (pluggable)          │
              │   - BroadcastChannel (dev)       │
              │   - Supabase Realtime (prod)     │
              └────────────────┬────────────────┘
                               │
                       (peer-to-peer)
                               │
              ┌────────────────┴────────────────┐
              │   Browser (React) — the other    │
              │   participant                    │
              └─────────────────────────────────┘
```

Two browsers establish an RTCPeerConnection. Media flows directly
between them. All session events (chat, annotation, presence) flow
through the same pluggable signalling transport.

---

## Why WebRTC + a signalling transport?

WebRTC is the only standard, broadly-supported way to deliver
low-latency audio and video between two browsers. It requires a
signalling channel to exchange offer/answer/ICE messages — but those
messages are tiny (kilobytes), so the signalling channel does NOT
need to handle media and does NOT need to be particularly fast.

In V1 we chose the simplest possible signalling transport:
`BroadcastChannel`. It works entirely inside the browser, so two
tabs on the same machine can connect with zero backend setup. The
public interface of `useSignaling` (`send`, `subscribe`, `waitForPeer`)
is identical to what a Supabase Realtime channel would expose, so
swapping the implementation later is a one-file change.

> **Trade-off:** BroadcastChannel only works inside the same browser
> origin on the same machine. It is intentionally NOT a production
> transport. To connect two different devices, swap
> `src/hooks/useSignaling.ts` to use Supabase Realtime (see Milestone 2
> in [`README.md`](./README.md)).

---

## Why not a mediasoup SFU yet?

A Selective Forwarding Unit (SFU) or Multipoint Conferencing Unit (MCU)
becomes valuable at ~3+ participants. JendCore V1 targets the
two-person session, which is the canonical "see it, point to it, solve
it" scenario. The peer-connection layer is structured so we can later
introduce an SFU by replacing `usePeerConnection` with a per-peer
subscriber model.

---

## Annotation engine

Annotations are stored as lightweight JSON, **normalised to the video
frame** in `[0, 1]` coordinates. Every stroke, arrow, circle, line,
and label travels over the signalling channel in the same compact form.

The renderer (`AnnotationCanvas`) draws them into a fixed `1000 × 1000`
SVG viewBox with `preserveAspectRatio="none"`, which means:

- An arrow drawn at `[0.2, 0.3] -> [0.8, 0.3]` on a phone appears at
  roughly the same proportional position on a laptop.
- Coordinates survive screen rotation, window resize, and aspect-ratio
  changes between devices.

Annotations are deliberately NOT modified on the video itself: a
separate transparent layer sits above the `<video>` element, which keeps
the media path clean and makes the overlay trivial to clear or persist
later.

---

## Session lifecycle

```
LANDING ──▶ START  ──▶ /s/:code ◀── JOIN ◀── LANDING
                              │
                              ▼
                         SESSION PAGE
                          (media + chat + annotate)
                              │
                              ▼
                            END ──▶ LANDING
```

Sessions are identified by short, human-shareable codes
(`JC-XXXX-XXXX`) generated client-side. There is no central registry in
V1 — the code is just a routing key. When the backend is introduced,
the same code will resolve to a row in the `sessions` table.

---

## State management

JendCore intentionally avoids global state libraries (Redux, Zustand,
etc.). Each piece of state lives in the hook or component that owns
it:

- Local media: `useLocalMedia`
- Peer connection: `usePeerConnection`
- Signalling/presence: `useSignaling`
- Chat: local `useState` in `SessionPage`
- Annotations: local `useState` in `SessionPage`

This keeps the bundle small and the data flow obvious.

---

## Network resilience

- The peer connection automatically attempts an ICE restart when the
  browser reports a `failed` connection state.
- A live "Connected / Reconnecting / Failed" badge is shown above the
  video tile so the user is never staring at a frozen screen without
  feedback.
- Mic and camera toggles happen in-place on the existing tracks, so
  they do not drop the connection.

---

## Build & deploy

- Vite produces a static SPA. Vercel serves it from a CDN.
- A single `vercel.json` (when needed) can pin the SPA rewrite and
  configure caching headers.
- The PWA manifest and service worker are emitted by `vite-plugin-pwa`
  for installability and application-shell caching.

---

## Out of scope for V1 (architecturally)

- Server-side media relay (TURN, SFU, MCU) — V1 is P2P.
- Persistent session storage — sessions are ephemeral.
- Server-side entitlement checks — the payment/Paystack layer is
  gated behind a serverless function in `api/`, so the secret never
  reaches the client.
- Authentication — V1 sessions are anonymous; user accounts are added
  only when lifetime licences require them.
