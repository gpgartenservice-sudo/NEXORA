-- NEXORA: TikTok & Instagram verbinden – Konten, Follower-Verlauf, Videos/Posts
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: das Social-Media-Skript (20261107090000_social.sql).

-- ---------------------------------------------------------------------------
-- Verbundene Konten (je Plattform eins). Die Zugangsdaten (token_data) sind
-- von der Server-Funktion "social" verschlüsselt – die App kann sie nicht
-- entschlüsseln.
-- ---------------------------------------------------------------------------
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'instagram')),
  external_id text not null check (char_length(external_id) between 1 and 200),
  username text check (char_length(username) <= 200),
  display_name text check (char_length(display_name) <= 200),
  avatar_url text check (char_length(avatar_url) <= 4000),
  profile_url text check (char_length(profile_url) <= 1000),
  followers integer check (followers >= 0),
  following integer check (following >= 0),
  likes bigint check (likes >= 0),
  media_count integer check (media_count >= 0),
  token_data text check (char_length(token_data) <= 8000),
  token_expires_at timestamptz,
  -- 'reconnect' = Zugang abgelaufen oder entzogen, bitte neu verbinden
  status text not null default 'ok' check (status in ('ok', 'reconnect')),
  last_error text check (char_length(last_error) <= 500),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

-- ---------------------------------------------------------------------------
-- Follower-Verlauf: ein Eintrag pro Konto und Tag
-- ---------------------------------------------------------------------------
create table if not exists public.social_account_stats (
  account_id uuid not null references public.social_accounts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  followers integer check (followers >= 0),
  following integer check (following >= 0),
  likes bigint check (likes >= 0),
  media_count integer check (media_count >= 0),
  primary key (account_id, day)
);

create index if not exists social_account_stats_user_idx on public.social_account_stats (user_id, day desc);

-- ---------------------------------------------------------------------------
-- Videos/Posts von TikTok und Instagram mit ihren Zahlen.
-- post_id = zugeordnete Idee aus dem Content-Board (Zahlen werden übernommen).
-- ---------------------------------------------------------------------------
create table if not exists public.social_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.social_accounts (id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'instagram')),
  external_id text not null check (char_length(external_id) between 1 and 200),
  caption text check (char_length(caption) <= 5000),
  url text check (char_length(url) <= 1000),
  thumbnail_url text check (char_length(thumbnail_url) <= 4000),
  media_type text check (media_type in ('video', 'carousel', 'image', 'story')),
  published_at timestamptz,
  views bigint check (views >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  shares bigint check (shares >= 0),
  saves bigint check (saves >= 0),
  post_id uuid references public.social_posts (id) on delete set null,
  -- false = Zuordnung wurde von Hand aufgehoben, nicht wieder automatisch zuordnen
  auto_link boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, external_id)
);

create index if not exists social_videos_user_idx on public.social_videos (user_id, published_at desc);
create index if not exists social_videos_post_idx on public.social_videos (post_id);

-- ---------------------------------------------------------------------------
-- Zugriff: jeder sieht und ändert nur seine eigenen Einträge
-- ---------------------------------------------------------------------------
alter table public.social_accounts enable row level security;
alter table public.social_account_stats enable row level security;
alter table public.social_videos enable row level security;

drop policy if exists "social_accounts_select_own" on public.social_accounts;
create policy "social_accounts_select_own" on public.social_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "social_accounts_insert_own" on public.social_accounts;
create policy "social_accounts_insert_own" on public.social_accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "social_accounts_update_own" on public.social_accounts;
create policy "social_accounts_update_own" on public.social_accounts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "social_accounts_delete_own" on public.social_accounts;
create policy "social_accounts_delete_own" on public.social_accounts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Verlauf und Videos nur zu eigenen Konten (und eigenen Posts)
drop policy if exists "social_account_stats_select_own" on public.social_account_stats;
create policy "social_account_stats_select_own" on public.social_account_stats
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "social_account_stats_insert_own" on public.social_account_stats;
create policy "social_account_stats_insert_own" on public.social_account_stats
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.social_accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );
drop policy if exists "social_account_stats_update_own" on public.social_account_stats;
create policy "social_account_stats_update_own" on public.social_account_stats
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.social_accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );
drop policy if exists "social_account_stats_delete_own" on public.social_account_stats;
create policy "social_account_stats_delete_own" on public.social_account_stats
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "social_videos_select_own" on public.social_videos;
create policy "social_videos_select_own" on public.social_videos
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "social_videos_insert_own" on public.social_videos;
create policy "social_videos_insert_own" on public.social_videos
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.social_accounts a where a.id = account_id and a.user_id = (select auth.uid()))
    and (post_id is null or exists (select 1 from public.social_posts p where p.id = post_id and p.user_id = (select auth.uid())))
  );
drop policy if exists "social_videos_update_own" on public.social_videos;
create policy "social_videos_update_own" on public.social_videos
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.social_accounts a where a.id = account_id and a.user_id = (select auth.uid()))
    and (post_id is null or exists (select 1 from public.social_posts p where p.id = post_id and p.user_id = (select auth.uid())))
  );
drop policy if exists "social_videos_delete_own" on public.social_videos;
create policy "social_videos_delete_own" on public.social_videos
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.social_accounts to authenticated;
grant select, insert, update, delete on public.social_account_stats to authenticated;
grant select, insert, update, delete on public.social_videos to authenticated;

drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists social_videos_set_updated_at on public.social_videos;
create trigger social_videos_set_updated_at
  before update on public.social_videos
  for each row execute function public.set_updated_at();
