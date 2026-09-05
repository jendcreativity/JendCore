# Stage 5: End-to-End Testing with Two Physical Devices

**Status**: Ready to Execute

---

## Prerequisites

Before starting, ensure:

1. **Supabase configured** (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local)
2. **Database migrations applied** (sessions table created)
3. **Realtime enabled** (sessions table publication ON)
4. **Production build succeeds** (npm run build)
5. **Dev server running** (npm run dev)

---

## Deployment Options

### Option A: Local Network Testing
1. Get laptop IP: `ipconfig getifaddr en0` (Mac) or `ipconfig` (Windows)
2. Start dev server: `npm run dev`
3. On phone: Open `http://YOUR-IP:5173`

### Option B: Vercel Deployment (Recommended)
1. Push to GitHub
2. Connect to Vercel
3. Auto-deploys to public URL
4. Open URL on two devices from anywhere

### Option C: ngrok Tunneling
1. Install ngrok: https://ngrok.com/download
2. Run: `ngrok http 5173`
3. Copy URL and open on two devices

---

## Test Session 1: Basic Connection

**Device A**: Click "Start a session" → Copy code
**Device B**: Click "Join a session" → Paste code → Click "Join"

**Verify**:
- [ ] Device A connection badge shows "Connected"
- [ ] Device B connection badge shows "Connected"
- [ ] Device A sees Device B's video
- [ ] Device B sees Device A's video
- [ ] Both see self-preview in corner

**Success**: Both connected, video flows both directions

---

## Test Session 2: Audio & Media Toggles

**Device A**:
1. Speak into microphone
2. Device B should hear audio
3. Click mic icon → OFF
4. Mic icon shows struck-through
5. Device B sees your mic icon OFF
6. Speak again → Device B hears nothing

**Device B**:
1. Click camera icon → OFF
2. Your self-preview goes black
3. Device A's remote video shows black
4. Connection badge stays "Connected"
5. Toggle camera back ON

**Verify**:
- [ ] Audio flows both directions
- [ ] Mic toggle instant both directions
- [ ] Camera toggle instant both directions
- [ ] Connection never drops

**Success**: All media controls work seamlessly

---

## Test Session 3: Chat Messages

**Device A**: Type "Hello from A" → Send
**Device B**: Should see immediately

**Device B**: Type "Hello from B" → Send
**Device A**: Should see immediately

**Verify**:
- [ ] Messages appear instantly (<300ms)
- [ ] No duplicate messages
- [ ] Same message order on both
- [ ] Author names correct

**Success**: Real-time chat works both directions

---

## Test Session 4: Annotations

**Device A**: Draw arrow on video → appears immediately
**Device B**: Should see arrow appear immediately

**Device B**: Draw freehand circle → appears immediately
**Device A**: Should see circle appear immediately

**Verify**:
- [ ] Drawings appear instantly
- [ ] Correct shapes and colors
- [ ] Both see all annotations
- [ ] Annotations persist

**Success**: Annotation sync works in real-time

---

## Test Session 5: Connection Recovery

**Setup**: Both devices connected

**Device B**: Disable WiFi → Connection badge shows "Reconnecting..."

**Wait**: 5-10 seconds

**Device B**: Re-enable WiFi → Badge returns to "Connected" → Video resumes

**Verify**:

---

## Metrics to Collect

| Metric | Target | Actual |
|--------|--------|--------|
| Time to connect | <5s | ___ |
| Message latency | <300ms | ___ |
| Annotation latency | <300ms | ___ |
| Reconnect time | <10s | ___ |

---

## Success Criteria

All of the following must pass:

- [ ] Two devices connect successfully
- [ ] Video streams both directions
- [ ] Audio flows both directions
- [ ] Mic/camera toggles work
- [ ] Chat messages sync in real-time
- [ ] Annotations sync in real-time
- [ ] Connection recovers from network changes
- [ ] Session persists to database
- [ ] End session works correctly
- [ ] No crashes or errors

---

## Results Documentation

After testing, document:

```
Date: ___________
Device A: ___________
Device B: ___________
Network: ___________
Deployment: ___________

Passed Tests:
- [x] Connection established
- [x] Video quality: ___________
- [x] Audio quality: ___________
- [x] Chat latency: ___________
- [x] Annotation latency: ___________
- [x] Connection stability: ___________

Issues encountered:
___________

Overall assessment: ___________
```

---

**Built by**: Kiro | **For**: JendCore — *See it. Point to it. Solve it.*

- [ ] "Reconnecting..." appears on network change
- [ ] Auto-reconnect within 10 seconds
- [ ] Both devices recover automatically
- [ ] Session persists (no rejoin needed)

**Success**: Resilient to network changes

---

## Test Session 6: Session Persistence

**Supabase Verification**:

1. After Device A creates session:
   ```sql
   SELECT * FROM sessions WHERE code = 'JC-XXXX-XXXX';
   -- Should show: ended_at = NULL (active)
   ```

2. After Device A clicks "End session":
   ```sql
   SELECT * FROM sessions WHERE code = 'JC-XXXX-XXXX';
   -- Should show: ended_at = [timestamp]
   ```

**Verify**:
- [ ] Session row created in database
- [ ] ended_at is NULL while active
- [ ] ended_at set when session ends

**Success**: Session persistence working
