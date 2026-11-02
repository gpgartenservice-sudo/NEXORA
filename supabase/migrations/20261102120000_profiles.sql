-- NEXORA: Profil jedes Nutzers (Antworten aus dem Onboarding)
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  business_name text check (char_length(business_name) <= 120),
  -- Wo steht der Nutzer gerade?
  stage text check (stage in ('idea', 'started', 'stuck', 'growing')),
  industry text check (
    industry in ('craft_service', 'ecommerce', 'creator', 'agency_freelance', 'gastro', 'consulting', 'other')
  ),
  -- bis zu 3 Schwerpunkte
  goals text[] not null default '{}' check (
    cardinality(goals) <= 3
    and goals <@ array[
      'first_customers', 'more_revenue', 'organization', 'social_growth', 'finances', 'motivation', 'team'
    ]::text[]
  ),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Profil und Onboarding-Antworten pro Nutzer';

-- Zugriff: jeder sieht und ändert ausschließlich sein eigenes Profil
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select, insert, update on public.profiles to authenticated;

-- updated_at automatisch setzen
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Bei jeder Registrierung automatisch ein leeres Profil anlegen
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profile für alle schon vorhandenen Konten nachtragen
insert into public.profiles (id, display_name)
select id, nullif(trim(raw_user_meta_data ->> 'full_name'), '')
from auth.users
on conflict (id) do nothing;
