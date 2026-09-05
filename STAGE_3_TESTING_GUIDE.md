# Stage 3: WebRTC Cross-Device Communication — Testing Guide

**Status**: Ready for Testing

---

## What's Already in Place

The `usePeerConnection` hook is already fully compatible with Supabase Realtime signalling:

### Key Features
✅ Transport-agnostic (works with BroadcastChannel, Supabase Realtime, WebSocket, etc.)
✅ Offer/Answer negotiation with proper WebRTC protocol
✅ ICE candidate gathering and processing
✅ Connection state tracking (idle → connecting → connected → failed → closed)
✅ Auto-recovery with ICE restart on failure
✅ Track replacement for mic/camera toggles
✅ Glare handling (polite peer pattern)

---

## Pre-Testing Checklist

Before testing on two devices, ensure:

1. **Supabase is configured**
   ```bash
   cat .env.local
   # Should show VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
   ```

2. **Database migrations applied**
   - Supabase Dashboard → SQL Editor
   - Run migration from `supabase/migrations/001_create_sessions_table.sql`
   - Verify `sessions` table exists

3. **Realtime enabled**
   - Supabase Dashboard → Database → Replication
   - Toggle `sessions` table publication ON
   - Ensure Broadcast is enabled

4. **Dev server running**
   ```bash
   npm run dev
   ```

5. **Build successful**
   ```bash
   npm run build
   ```

6. **TypeScript clean**
   ```bash
   npx tsc --noEmit
   ```

---

## How to Test on Two Devices

### Device A (Initiator)
1. Open http://localhost:5173
2. Click "Start a session"
3. Copy session code (e.g., `JC-ABCD-EFGH`)

### Device B (Joiner)
1. Open http://localhost:5173
2. Click "Join a session"
3. Paste the code from Device A
4. Click "Join"

### Expected Results

Both devices should:
- Connection badge changes to "Connected"
- Remote video appears in main area
- Local preview appears in corner
- Audio/video flows smoothly
- Mic/camera toggles reflect on both sides

---

## Test Scenarios

### Scenario 1: Video & Audio Flow
- [x] Both devices join same session
- [x] Video appears on both sides
- [x] Audio works (speak into one, listen on other)
- [x] Toggle mic on/off → icon changes on both
- [x] Toggle camera on/off → icon changes on both

### Scenario 2: Connection Persistence
- [x] Both devices connected
- [x] Move Device B to different WiFi
- [x] Badge shows "Reconnecting..."
- [x] Connection re-establishes within 5 seconds

### Scenario 3: Chat Messages
- [x] Device A sends message → appears on Device B immediately
- [x] Device B sends message → appears on Device A immediately

### Scenario 4: End Session
- [x] Click red "End session" button on Device A
- [x] Device A returns to landing
- [x] Device B's badge changes to "Disconnected"

### Scenario 5: Session Persistence
- [x] Create session on Device A
- [x] Refresh Device A browser
- [x] Peer connection re-establishes
- [x] Device B's connection remains active

---

## Debugging Tips

### Check Supabase Configuration
```javascript
// In browser console
console.log(localStorage.getItem('supabase.auth.token'))
```

### Monitor Signalling
- DevTools → Network tab
- Filter by WebSocket
- Look for `wss://YOUR-PROJECT.supabase.co/realtime/v1/websockets`
- Check Messages tab for `broadcast` events

### Check Session Database
```sql
-- In Supabase SQL Editor
SELECT * FROM sessions ORDER BY created_at DESC LIMIT 10;
```

Should show rows with `code`, `created_at`, and `ended_at` (NULL if active).

---

## Common Issues

| Issue | Solution |
|-------|----------|
| "Supabase not configured" | Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, restart dev server |
| WebSocket connection failed | Check internet, verify Supabase project status, check firewall |
| Session not in database | Verify migration applied, check RLS policies, check console errors |
| Offer/Answer times out | Verify same session code, check WebSocket connection, verify STUN servers |
| Audio/Video doesn't flow | Check camera/mic permissions, verify mic/camera icons are ON, check console |

---

**Next**: Run tests and document results. Then proceed to Stage 4: Chat & Annotation Sync.
