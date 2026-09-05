# JendCore

> **See it. Point to it. Solve it.**

JendCore is a simple real-time visual communication tool. It helps two or
more people see, discuss, point at, mark, and guide one another over live
video — without forcing them to learn a complicated conferencing suite.

Typical use case: a technician in the field points a phone camera at a
machine; a senior engineer on a laptop sees the live feed, talks them
through the issue, and draws an arrow on the video to indicate the exact
component.

---

## What it does today (V1)

- Start or join a session by code (`JC-XXXX-XXXX`) or shareable link.
- Live audio and video (WebRTC) between two participants.
- Mic / camera toggle, front-rear camera flip.
- Real-time annotation overlay (freehand, arrow, circle, line, text, clear).
- Real-time text chat inside the session.
- Mobile-first responsive UI; installable as a PWA.
- Graceful permission, connection, and device error states.
- Works fully end-to-end without any backend configuration, for development.

---

## What it deliberately does not do (yet)

See [`FUTURE_FEATURES.md`](./FUTURE_FEATURES.md). Anything not listed in
that file is intentionally out of scope. Do not add features that don't
help two people communicate visually.

---

## Getting started

### Requirements

- Node.js 20 or newer
- npm 10 or newer

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Then open the printed URL (usually `http://localhost:5173`). To test the
real-time experience without a backend, open the app in two browser tabs
or windows, start a session in one, copy the invite link, and open it in
the other.

### Type-check, lint, build

```bash
npm run typecheck
npm run lint
npm run build
```

### Preview a production build

```bash
npm run preview
```

---

## Configuration

Copy `.env.example` to `.env.local` and fill in the values you need.

| Variable                  | Required | Purpose                                         |
| ------------------------- | -------- | ----------------------------------------------- |
| `VITE_SUPABASE_URL`       | No\*     | Public Supabase project URL                     |
| `VITE_SUPABASE_ANON_KEY`  | No\*     | Public anon key (safe to expose in the browser) |
| `VITE_TRIAL_DAYS`         | No       | Number of free trial days (default 7)           |
| `VITE_LICENSE_PRICE_NGN`  | No       | Price in kobo                                   |
| `VITE_LICENSE_PRICE_USD`  | No       | Price in cents                                  |
| `PAYSTACK_SECRET_KEY`     | No       | **Server-side only.** Paystack verification.    |

\* Supabase is optional in development; the app uses an in-browser
BroadcastChannel for signalling until the Supabase transport is wired up.

> ⚠️ Never put the Supabase **service-role key**, the Paystack secret,
> or any other private credential in any file prefixed with `VITE_` or
> inside `src/`. Such keys would be bundled into the browser code.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and
[`DATABASE.md`](./DATABASE.md) for more details.

---

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the project into Vercel.
3. Vercel will detect Vite automatically. No custom build command needed.
4. Add the environment variables listed in `.env.example` to your Vercel
   project's **Environment Variables** section.
5. Deploy. Then visit the production URL and verify camera/microphone
   permissions and PWA installation.

HTTPS is required for camera/microphone access on the web. Vercel
provides this automatically.

---

## Testing

See [`TESTING.md`](./TESTING.md) for the manual checklist used before
declaring each milestone complete.

---

## Repository layout

```
.
├── api/                  # Vercel serverless functions (server-side only)
├── public/               # Static assets
├── src/
│   ├── components/       # React UI primitives
│   ├── hooks/            # Custom hooks (peer connection, local media, signalling)
│   ├── lib/              # Pure helpers (annotations, chat, supabase, session codes)
│   ├── pages/            # Route components
│   ├── App.tsx           # Router
│   ├── main.tsx          # Entry point
│   └── index.css         # Tailwind base
├── index.html
├── package.json
├── tailwind.config.js
├── vite.config.ts
├── tsconfig*.json
├── ARCHITECTURE.md
├── DATABASE.md
├── FUTURE_FEATURES.md
├── TESTING.md
└── README.md
```

---

## License

Proprietary. © JendCore.
