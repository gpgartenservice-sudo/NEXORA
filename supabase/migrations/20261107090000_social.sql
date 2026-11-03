-- NEXORA: Social Media – Content-Board, Wochenplan, Zahlen, Hashtag-Sets
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.

-- ---------------------------------------------------------------------------
-- Posts: von der Idee bis zur Veröffentlichung. Der Status (Idee, In Arbeit,
-- Bereit, Veröffentlicht) wird in der App aus den Schritten berechnet.
-- ---------------------------------------------------------------------------
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  format text not null default 'video' check (format in ('video', 'carousel', 'image', 'story', 'text')),
  platforms text[] not null default '{}'
    check (platforms <@ array['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'x', 'pinterest', 'threads']::text[]),
  -- Schritte (Bedeutung je Format, z. B. Video: Skript, Gedreht, Geschnitten, Caption)
  step_concept boolean not null default false,
  step_produced boolean not null default false,
  step_edited boolean not null default false,
  step_caption boolean not null default false,
  script text check (char_length(script) <= 10000),
  caption text check (char_length(caption) <= 5000),
  hashtags text check (char_length(hashtags) <= 2000),
  planned_for timestamptz,
  published_at timestamptz,
  url text check (char_length(url) <= 500),
  -- Zahlen nach der Veröffentlichung
  views integer check (views >= 0),
  likes integer check (likes >= 0),
  comments integer check (comments >= 0),
  shares integer check (shares >= 0),
  saves integer check (saves >= 0),
  followers integer check (followers >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_posts_user_idx on public.social_posts (user_id, updated_at desc);
create index if not exists social_posts_planned_idx on public.social_posts (user_id, planned_for);

-- ---------------------------------------------------------------------------
-- Hashtag-Sets: wiederverwendbare Hashtag-Gruppen
-- ---------------------------------------------------------------------------
create table if not exists public.hashtag_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  tags text not null check (char_length(trim(tags)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hashtag_sets_user_idx on public.hashtag_sets (user_id, name);

-- ---------------------------------------------------------------------------
-- Zugriff: jeder sieht und ändert nur seine eigenen Einträge
-- ---------------------------------------------------------------------------
alter table public.social_posts enable row level security;
alter table public.hashtag_sets enable row level security;

drop policy if exists "social_posts_select_own" on public.social_posts;
create policy "social_posts_select_own" on public.social_posts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "social_posts_insert_own" on public.social_posts;
create policy "social_posts_insert_own" on public.social_posts
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "social_posts_update_own" on public.social_posts;
create policy "social_posts_update_own" on public.social_posts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "social_posts_delete_own" on public.social_posts;
create policy "social_posts_delete_own" on public.social_posts
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "hashtag_sets_select_own" on public.hashtag_sets;
create policy "hashtag_sets_select_own" on public.hashtag_sets
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "hashtag_sets_insert_own" on public.hashtag_sets;
create policy "hashtag_sets_insert_own" on public.hashtag_sets
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "hashtag_sets_update_own" on public.hashtag_sets;
create policy "hashtag_sets_update_own" on public.hashtag_sets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "hashtag_sets_delete_own" on public.hashtag_sets;
create policy "hashtag_sets_delete_own" on public.hashtag_sets
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.social_posts to authenticated;
grant select, insert, update, delete on public.hashtag_sets to authenticated;

drop trigger if exists social_posts_set_updated_at on public.social_posts;
create trigger social_posts_set_updated_at
  before update on public.social_posts
  for each row execute function public.set_updated_at();

drop trigger if exists hashtag_sets_set_updated_at on public.hashtag_sets;
create trigger hashtag_sets_set_updated_at
  before update on public.hashtag_sets
  for each row execute function public.set_updated_at();
