# Milestone 2 Setup Guide — Supabase Configuration

## Prerequisites

You need a Supabase project. If you don't have one:

1. Go to https://supabase.com
2. Create a new project (free tier is sufficient for testing)
3. Wait for the project to initialize
4. Copy your project URL and anon key

## Step 1: Configure Environment Variables

1. Create `.env.local` in the project root (if it doesn't exist)
2. Add your Supabase credentials:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLIC-ANON-KEY
```

Replace with your actual values from Supabase Dashboard → Project Settings → API.

## Step 2: Apply Database Migrations

1. Log in to your Supabase project dashboard
2. Go to SQL Editor
3. Create a new query and paste the contents of `supabase/migrations/001_create_sessions_table.sql`
4. Execute the query

The migration will:
- Create the `sessions` table
- Set up Row Level Security (RLS) policies
- Create indexes for fast lookups
- Allow anonymous users to insert/select/update sessions

## Step 3: Enable Realtime for the sessions table

In Supabase Dashboard:

1. Go to Database → Replication
2. Find the `sessions` table
3. Enable publication for the table
4. Ensure Broadcast is enabled (should be by default)

This allows the application to receive real-time updates when other peers broadcast signals.

## Step 4: Restart the Dev Server

```bash
npm run dev
```

The application will now:
- Automatically detect Supabase credentials
- Use Supabase Realtime for cross-device signalling (if configured)
- Fall back to BroadcastChannel if Supabase is not configured
- Persist session metadata to the database

## How to Test

### Local Testing (Same Browser)
- Open two tabs at http://localhost:5173
- You can still use BroadcastChannel by not setting `.env.local`
- Sessions won't persist to Supabase if credentials aren't configured

### Cross-Device Testing (Two Physical Devices)
1. Ensure both `.env.local` files have identical Supabase credentials
2. Start the dev server on one machine: `npm run dev`
3. Deploy to a public URL (or use ngrok for local tunneling)
4. Open the deployed URL on both devices
5. Create/join sessions from each device
6. They should now communicate via Supabase Realtime

## Troubleshooting

### "Supabase not configured; signalling unavailable"
- Check that `.env.local` exists and has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Restart the dev server after creating `.env.local`

### Session creation fails
- Check that the `sessions` table exists in Supabase
- Verify RLS policies are in place
- Check browser console for specific error messages

### Realtime messages not received
- Ensure "Replication" is enabled for the `sessions` table
- Check that Broadcast is enabled in Replication settings
- Verify network connectivity between devices

### WebRTC connection fails
- Check that both peers are in the same session (same code)
- Verify firewall isn't blocking peer connections
- Check browser console for ICE candidate errors
- Make sure cameras/mics have permission on both devices

---

**Next**: Follow the two-device testing guide in the main README once Supabase is configured.
