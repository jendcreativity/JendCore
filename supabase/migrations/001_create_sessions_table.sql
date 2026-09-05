-- Migration: 001_create_sessions_table
-- Description: Create the sessions table for tracking active and completed sessions

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  
  constraint code_format check (code ~ '^JC-[A-Z0-9]{4}-[A-Z0-9]{4}$')
);

-- Indexes for fast lookups
create index if not exists idx_sessions_code on public.sessions(code);
create index if not exists idx_sessions_created_at on public.sessions(created_at desc);

-- Enable RLS
alter table public.sessions enable row level security;

-- RLS Policies
-- Anyone can select (the code is the secret)
create policy "sessions_select_all" on public.sessions
  for select
  using (true);

-- Anyone can insert (used to claim a code on first join)
create policy "sessions_insert_all" on public.sessions
  for insert
  with check (true);

-- Anyone can update only to set ended_at
create policy "sessions_update_ended_at" on public.sessions
  for update
  using (true)
  with check (
    -- Only allow updating ended_at field
    (select count(*) from (
      select jsonb_each(to_jsonb(new.*) - to_jsonb(old.*))
    ) as t(key, val)
    where key not in ('ended_at', 'updated_at')
    ) = 0
  );

-- Grant permissions
grant select, insert, update on public.sessions to anon;
