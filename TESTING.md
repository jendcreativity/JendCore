# Testing

JendCore V1 uses mostly manual testing. The product is a real-time
multi-device experience, so automated browser tests will only get us
so far; the authoritative test is "two real devices, in two real
networks, with two real humans".

Each milestone is signed off using the checklist that follows.

---

## Before every milestone

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm run preview` serves the production build and the app loads.

## Milestone 0 — Project foundation

- [ ] `npm install` completes.
- [ ] `npm run dev` starts the Vite dev server.
- [ ] Tailwind classes are applied (the landing screen looks dark with the brand colour).
- [ ] `.env.example` is committed; `.env` is in `.gitignore`.
- [ ] `README.md` explains install, run, build, deploy.

## Milestone 1 — UI/UX

- [ ] Landing screen has two large buttons (`Start session`, `Join session`).
- [ ] Start screen shows a session code and a copy button.
- [ ] Join screen accepts a session code with validation feedback.
- [ ] Session page renders the video area and a control bar even with no media.
- [ ] Layout works at 360×640, 768×1024, and 1440×900.

## Milestone 2 — Supabase foundation

- [ ] `npm run build` succeeds with placeholder env vars.
- [ ] `getSupabase()` returns a client when env vars are set.
- [ ] Service-role key is **not** present anywhere under `src/`.

## Milestone 3 — Session creation / joining

- [ ] Two browser tabs on the same machine can create and join a session.
- [ ] An invalid code shows an inline error and does not navigate.

## Milestone 4 — WebRTC

- [ ] Two tabs on the same machine exchange audio and video.
- [ ] Muting the local mic stops outgoing audio without ending the call.
- [ ] Disabling the local camera stops outgoing video without ending the call.
- [ ] On a phone (Chrome Android), the rear camera can be selected.
- [ ] Connection state badge moves from `Connecting…` → `Connected`.

## Milestone 5 — Text chat

- [ ] Messages typed in one tab appear in the other tab within 1 second.
- [ ] Empty messages are not sent.
- [ ] The chat scroll position tracks the newest message.

## Milestone 6 — Annotation

- [ ] Drawing on one tab appears on the other tab as the stroke is being drawn.
- [ ] Arrow, circle, line, freehand, and text all work.
- [ ] Clear removes all annotations on both tabs.
- [ ] An arrow drawn on a phone appears in roughly the same proportional
      position on a desktop window.

## Milestone 7 — Network resilience

- [ ] Toggling DevTools "Offline" shows the `Reconnecting…` badge.
- [ ] Coming back online reconnects within a few seconds.
- [ ] A `getUserMedia` denial shows a clear, friendly error banner.

## Milestone 8 — PWA

- [ ] `npm run build` produces a service worker and manifest.
- [ ] On Chrome Android, "Add to Home Screen" installs JendCore.
- [ ] Launching from the home screen opens in standalone mode.

## Milestone 9 — Real-user testing preparation

- [ ] A non-developer can: start a session, share the link, join from
      another device, talk, annotate, chat, and end the session without
      help.

## Milestone 10 — Commercial system

- [ ] `npm run build` succeeds with `PAYSTACK_SECRET_KEY` unset (the app
      must NOT crash).
- [ ] No Paystack secret is bundled in `dist/`.
- [ ] A simulated payment webhook flips `licences.status` to `active`.

## Milestone 11 — Production deployment

- [ ] `https://` is enforced.
- [ ] Camera and microphone prompts work on production URL.
- [ ] Two devices on different networks can hold a stable call.
- [ ] Annotation and chat work on the production URL.

## Milestone 12 — APK preparation

- [ ] `npm run build` succeeds with `target` set to `es2019` for older
      WebView compatibility.
- [ ] Manual APK build with Trusted Web Activity or Capacitor succeeds.
