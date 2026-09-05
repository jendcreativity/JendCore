# Database

JendCore stores very little. V1 does not require a database to function
— sessions live entirely in the browser via WebRTC and BroadcastChannel
signalling.

The schema described below is the **forward-looking design** that the
Supabase integration will use when the backend is wired up. Keep it
small, well-typed, and locked down with Row Level Security.

---

## Tables

### `sessions`

A row exists for each session that has been explicitly created or
joined. Used for analytics, abuse prevention, and (later) tying
payments to usage.

| Column        | Type                  | Notes                              |
| ------------- | --------------------- | ---------------------------------- |
| `id`          | `uuid` PK             | Server-assigned                    |
| `code`        | `text` UNIQUE NOT NULL| `JC-XXXX-XXXX`                     |
| `created_by`  | `uuid` NULL           | Future: FK → `auth.users.id`       |
| `created_at`  | `timestamptz`         | default `now()`                    |
| `ended_at`    | `timestamptz` NULL    |                                    |
| `metadata`    | `jsonb`               | Lightweight stats only             |

Indexes:

- `unique (code)`

RLS:

- `select`: anyone (the code is the secret).
- `insert`: anyone (used to claim a code on first join).
- `update`: anyone, but only to set `ended_at`.

### `licences`

A row per paid lifetime licence.

| Column         | Type                  | Notes                              |
| -------------- | --------------------- | ---------------------------------- |
| `id`           | `uuid` PK             |                                    |
| `user_id`      | `uuid` NOT NULL       | FK → `auth.users.id`               |
| `purchased_at` | `timestamptz`         |                                    |
| `paystack_ref` | `text` UNIQUE NOT NULL| Transaction reference from Paystack|
| `price_kobo`   | `integer`             | Snapshot at purchase time          |
| `currency`     | `text`                | `NGN` / `USD` / etc.               |
| `status`       | `text`                | `active` / `refunded`              |

RLS:

- `select`: only the owning user.

### `trials`

| Column      | Type          | Notes                                        |
| ----------- | ------------- | -------------------------------------------- |
| `user_id`   | `uuid` PK     | FK → `auth.users.id`                         |
| `started_at`| `timestamptz` |                                              |
| `expires_at`| `timestamptz` | `started_at + VITE_TRIAL_DAYS`               |

RLS:

- `select`/`insert`/`update`: only the owning user, via service role on the server.

---

## What we deliberately do NOT store

- Video or audio (P2P only).
- Annotation history beyond the live session.
- Chat history beyond the live session.
- Profile information beyond what Supabase Auth needs.

---

## Secret-handling rules

- Only the **anon** key is referenced from the browser (see
  `src/lib/supabase.ts`).
- The **service-role** key is used **only** by server-side code, in
  Vercel serverless functions under `api/`. It MUST NOT be prefixed
  with `VITE_` or appear anywhere under `src/`.
- The Paystack secret is similarly server-side only.

---

## Migrations

When the database is created, run the SQL files in `supabase/migrations/`
in order. Migrations are tracked by Supabase automatically; do not edit
old migrations — add a new one.
