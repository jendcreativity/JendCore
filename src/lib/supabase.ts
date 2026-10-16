/**
 * Supabase client.
 *
 * Used for real-time signalling (Supabase Realtime broadcast channels),
 * and for future features (auth, entitlement, persistent session
 * metadata).
 *
 * Configuration resolves in this order:
 *   1. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, when non-empty.
 *   2. The public project defaults declared below.
 *
 * The publishable/anon key is safe to expose in the browser — it is
 * bound to Row Level Security policies server-side. The service-role
 * key MUST NEVER appear in this file or any other client-side file.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Project defaults.
 *
 * These two values are deliberately public. They are inlined into the client
 * bundle of every build and are bound by Row Level Security on the Supabase
 * side, so they grant no privileged access on their own. Keeping them here
 * means a production build still pairs devices even when the hosting platform
 * does not inject `VITE_SUPABASE_*` — for example when those variables are
 * defined but empty in the project settings, which silently overrides any
 * `.env` file during a Vite build.
 *
 * A non-empty, non-placeholder `VITE_*` value always wins, so a different
 * Supabase project (or a rotated key) can be supplied without touching code.
 */
const DEFAULT_SUPABASE_URL = 'https://ltvjxbydbnneemvadfec.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'sb_publishable_DOvmF-zXPrnsXxY1r6FI4Q_E95AzR_M';

/** Treats empty strings and the `.env.example` placeholders as "not set". */
function resolveEnvValue(
  raw: string | undefined,
  fallback: string
): string {
  const value = (raw ?? '').trim();
  if (!value || /^(your[-_]|replace[-_]?me)/i.test(value)) return fallback;
  return value;
}

const url = resolveEnvValue(
  import.meta.env.VITE_SUPABASE_URL,
  DEFAULT_SUPABASE_URL
);
const anonKey = resolveEnvValue(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_ANON_KEY
);

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (cached) return cached;
  cached = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}
