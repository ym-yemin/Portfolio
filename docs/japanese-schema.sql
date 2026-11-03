-- Japanese study app schema for Supabase
-- Run in Supabase SQL Editor once.

create extension if not exists pgcrypto;

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

alter table public.japanese_cards enable row level security;
alter table public.japanese_user_progress enable row level security;

drop policy if exists "authenticated users can read japanese cards" on public.japanese_cards;
create policy "authenticated users can read japanese cards"
on public.japanese_cards
for select
to authenticated
using (true);

drop policy if exists "users can read own japanese progress" on public.japanese_user_progress;
create policy "users can read own japanese progress"
on public.japanese_user_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own japanese progress" on public.japanese_user_progress;
create policy "users can insert own japanese progress"
on public.japanese_user_progress
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own japanese progress" on public.japanese_user_progress;
create policy "users can update own japanese progress"
on public.japanese_user_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Intentionally no INSERT/UPDATE/DELETE policy for japanese_cards.
-- Add study material only through the Supabase dashboard / SQL editor.
