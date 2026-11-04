-- OpenDeck cloud library. Run once in the Supabase SQL editor.
-- Audio files live in Cloudflare R2; this table holds what each user owns and the
-- analysis and cue points that travel between computers.

create table if not exists public.tracks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- SHA-256 of the file contents: the same file is stored once per user.
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  ext text not null check (ext ~ '^[a-z0-9]{2,5}$'),
  size bigint not null check (size > 0),
  title text not null,
  artist text not null default '',
  duration real,
  bpm real,
  first_beat real,
  key_tonic smallint check (key_tonic between 0 and 11),
  key_mode text check (key_mode in ('major', 'minor')),
  cue real,
  hot_cues jsonb not null default '[]'::jsonb,
  uploaded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, hash)
);

alter table public.tracks enable row level security;

drop policy if exists "Users read their tracks" on public.tracks;
create policy "Users read their tracks" on public.tracks
  for select using (auth.uid() = user_id);

drop policy if exists "Users add their tracks" on public.tracks;
create policy "Users add their tracks" on public.tracks
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users change their tracks" on public.tracks;
create policy "Users change their tracks" on public.tracks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users remove their tracks" on public.tracks;
create policy "Users remove their tracks" on public.tracks
  for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tracks_touch on public.tracks;
create trigger tracks_touch before update on public.tracks
  for each row execute function public.touch_updated_at();
