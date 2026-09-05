/**
 * Signalling transport factory.
 *
 * Automatically selects between:
 * - BroadcastChannel (local development, same browser)
 * - Supabase Realtime (production, cross-device)
 *
 * This is the single point of configuration for swapping signalling backends.
 */

import { isSupabaseConfigured } from '../lib/supabase';
import { useSignaling as useBroadcastChannelSignaling } from './useSignaling';
import { useSupabaseSignaling } from './useSupabaseSignaling';
import { SignalingControls } from './usePeerConnection';

/**
 * Returns the appropriate signalling hook based on environment.
 *
 * - If Supabase is configured, uses Realtime (cross-device)
 * - Otherwise, falls back to BroadcastChannel (local dev)
 */
export function useSignaling(sessionId: string): SignalingControls {
  // For now, prefer Supabase if configured, otherwise BroadcastChannel
  if (isSupabaseConfigured()) {
    return useSupabaseSignaling(sessionId);
  }
  return useBroadcastChannelSignaling(sessionId);
}
