/**
 * Supabase client.
 *
 * This client is currently only used for future features (auth,
 * entitlement, persistent session metadata). Real-time signalling
 * still goes through the BroadcastChannel transport in `useSignaling`
 * so the app works fully end-to-end without configuring Supabase.
 *
 * The anon key is safe to expose in the browser — it is bound to
 * Row Level Security policies server-side. The service-role key MUST
 * NEVER appear in this file or any other client-side file.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
