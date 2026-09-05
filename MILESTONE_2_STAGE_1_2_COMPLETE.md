# Milestone 2 Implementation Guide — Backend Integration

**Status**: Stage 1 & 2 Complete (Supabase Configuration & Signalling Transport)

---

## What's Been Implemented

### Stage 1: Supabase Configuration ✅
- Created `supabase/migrations/001_create_sessions_table.sql` with:
  - `sessions` table with code, created_at, ended_at, metadata
  - Row Level Security (RLS) policies for anonymous access
  - Indexes for fast lookups
- Created `SUPABASE_SETUP.md` with step-by-step configuration instructions

### Stage 2: Pluggable Signalling Transport ✅
- Created `src/hooks/useSupabaseSignaling.ts`:
  - Uses Supabase Realtime for cross-device communication
  - Identical public interface to BroadcastChannel version
  - Automatic fallback if Supabase not configured
  - Handles hello/bye peer announcements
  
- Created `src/hooks/useSignalingFactory.ts`:
  - Intelligently selects between:
    - Supabase Realtime (if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured)
    - BroadcastChannel (local development)
  - Single point of configuration for swapping backends

- Updated `src/pages/SessionPage.tsx`:
  - Uses factory instead of direct useSignaling import
  - Persists session creation to Supabase (`sessions` table)
  - Marks session as ended when user exits
  - Gracefully handles missing Supabase configuration

### Configuration Files Created ✅
- `eslint.config.js` — Updated ESLint to v9 format
- `SUPABASE_SETUP.md` — User instructions for Supabase setup

---

## How to Use (Next Steps)

### 1. Set Up Supabase (Required for Cross-Device)

Follow `SUPABASE_SETUP.md`:

```bash
# 1. Create .env.local with your credentials
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLIC-ANON-KEY

# 2. Run migrations in Supabase SQL Editor
# (Copy contents of supabase/migrations/001_create_sessions_table.sql)

# 3. Enable Realtime for sessions table in Supabase Dashboard
```

### 3. Test Locally First (Same Browser)

Without Supabase configured:
```bash
rm .env.local  # Remove credentials
npm run dev
```

Open two tabs → create/join session → should work via BroadcastChannel.

### 4. Test Cross-Device

With Supabase configured:
1. Deploy app to public URL (or use ngrok for local tunneling)
2. Open URL on two different devices
3. Create session on device 1, join on device 2
4. Both should communicate via Supabase Realtime

---

## Architecture

```
┌─── Device A ─────────────────────────────────────────┐
│ Browser (React)                                      │
│                                                      │
│  useSignalingFactory() → useSupabaseSignaling()      │
│         ↓                                             │
│  Supabase Realtime Channel (jendcore:session:CODE)   │
└─────────────────────────────────────────┬────────────┘
                                          │
                        ┌─────────────────┴─────────────────┐
                        │  Supabase Realtime (Cloud)        │
                        │  PostgreSQL LISTEN/NOTIFY         │
                        └─────────────────┬─────────────────┘
                                          │
┌─── Device B ─────────────────────────────────────────┐
│ Browser (React)                                      │
│                                                      │
│  useSignalingFactory() → useSupabaseSignaling()      │
│         ↓                                             │
│  Supabase Realtime Channel (jendcore:session:CODE)   │
└──────────────────────────────────────────────────────┘
```

Signalling messages (offer, answer, ICE candidates) flow through Realtime.
WebRTC media flows directly P2P (not through cloud).

---

## Current Limitations (Known, Intentional)

1. **Requires Supabase Setup** — App works locally without it (via BroadcastChannel), but cross-device needs Supabase credentials
2. **No Chat/Annotation Sync Yet** — Stage 4 will implement real-time sync for chat and annotations
3. **No Persistence Beyond Session** — Chat/annotations cleared when session ends (by design, V1)
4. **No Authentication** — V1 sessions are anonymous (identified by code only)
5. **No TURN Servers** — Direct P2P only; may fail behind restrictive firewalls (Stage 3 will address)

---

## Testing Checklist

### ✅ Completed
- [x] TypeScript compiles without errors
- [x] Build succeeds (dist/ created)
- [x] Signalling factory switches between backends
- [x] Session table RLS policies in place
- [x] SessionPage persists to Supabase

### 🔄 In Progress
- [ ] Stage 3: WebRTC cross-device communication
- [ ] Stage 4: Chat & annotation sync
- [ ] Stage 5: End-to-end testing with two physical devices

### ❌ Not Yet
- [ ] TURN server configuration
- [ ] Connection failure recovery
- [ ] Realtime sync verification
- [ ] Two-device live test

---

## Files Modified/Created

| File | Status | Changes |
|------|--------|---------|
| `src/hooks/useSupabaseSignaling.ts` | ✅ NEW | Supabase Realtime signalling |
| `src/hooks/useSignalingFactory.ts` | ✅ NEW | Auto-select transport |
| `src/pages/SessionPage.tsx` | ✅ UPDATED | Use factory, persist session |
| `supabase/migrations/001_create_sessions_table.sql` | ✅ NEW | Database schema |
| `SUPABASE_SETUP.md` | ✅ NEW | User setup guide |
| `eslint.config.js` | ✅ NEW | ESLint v9 config |

---

## What's Next

### Stage 3: WebRTC Cross-Device Communication
- Verify usePeerConnection works with Supabase signalling
- Test offer/answer exchange
- Test ICE candidate gathering
- Implement connection retry logic
- Add TURN server support for restrictive networks

### Stage 4: Chat & Annotation Sync
- Persist chat messages through signalling channel
- Sync annotations in real-time
- Ensure message ordering
- Handle dropped/late messages

### Stage 5: End-to-End Testing
- Build production bundle
- Deploy to staging environment
- Test with two physical devices (iOS/Android, different networks)
- Verify session persistence in database
- Test reconnection scenarios

---

## Troubleshooting

### "Supabase not configured; signalling unavailable"
- Check `.env.local` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Restart dev server after creating `.env.local`

### Build errors
```bash
rm -r dist node_modules
npm install
npm run build
```

### TypeScript errors
```bash
npx tsc --noEmit
```

### Linting
```bash
npx eslint src
```

---

## Summary

Milestone 2, Stage 1-2 is complete. The application now has:
- ✅ Configurable Supabase backend
- ✅ Pluggable signalling (Realtime vs BroadcastChannel)
- ✅ Session persistence
- ✅ Ready for cross-device testing

**Next**: Follow `SUPABASE_SETUP.md` to configure Supabase, then we'll move to Stage 3.

---

**Built by**: Kiro | **For**: JendCore — *See it. Point to it. Solve it.*


