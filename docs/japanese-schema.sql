-- Japanese study app schema for Supabase
-- Run once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.japanese_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  note text
);

create table if not exists public.japanese_cards (
  id uuid primary key default gen_random_uuid(),
  deck_slug text not null,
  sort_order integer not null default 0,
  prompt text not null,
  reading text not null,
  meaning text not null,
  note text,
  group_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (deck_slug, sort_order)
);

create table if not exists public.japanese_user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.japanese_cards(id) on delete cascade,
  due_at timestamptz not null default now(),
  interval_days double precision not null default 0,
  ease_factor double precision not null default 2.5,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  last_rating text,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index if not exists japanese_cards_deck_idx
  on public.japanese_cards(deck_slug, is_active, sort_order);

create index if not exists japanese_progress_due_idx
  on public.japanese_user_progress(user_id, due_at);

alter table public.japanese_access enable row level security;
alter table public.japanese_cards enable row level security;
alter table public.japanese_user_progress enable row level security;

-- Harden table privileges. Signed-out visitors get nothing.
revoke all on table public.japanese_access from anon, authenticated;
revoke all on table public.japanese_cards from anon, authenticated;
revoke all on table public.japanese_user_progress from anon, authenticated;

grant select on table public.japanese_access to authenticated;
grant select on table public.japanese_cards to authenticated;
grant select, insert, update on table public.japanese_user_progress to authenticated;

drop policy if exists "users can verify own japanese access" on public.japanese_access;
create policy "users can verify own japanese access"
on public.japanese_access
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "approved users can read japanese cards" on public.japanese_cards;
create policy "approved users can read japanese cards"
on public.japanese_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.japanese_access a
    where a.user_id = auth.uid()
  )
);

drop policy if exists "approved users can read own japanese progress" on public.japanese_user_progress;
create policy "approved users can read own japanese progress"
on public.japanese_user_progress
for select
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.japanese_access a
    where a.user_id = auth.uid()
  )
);

drop policy if exists "approved users can insert own japanese progress" on public.japanese_user_progress;
create policy "approved users can insert own japanese progress"
on public.japanese_user_progress
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.japanese_access a
    where a.user_id = auth.uid()
  )
);

drop policy if exists "approved users can update own japanese progress" on public.japanese_user_progress;
create policy "approved users can update own japanese progress"
on public.japanese_user_progress
for update
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.japanese_access a
    where a.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.japanese_access a
    where a.user_id = auth.uid()
  )
);

-- No client INSERT/UPDATE/DELETE grants are given for japanese_cards or japanese_access.
-- Add cards and grant users only from the Supabase dashboard / SQL editor.
