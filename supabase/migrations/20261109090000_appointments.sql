-- NEXORA: Termine – eigene Termine und Kalender-Abo
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Termine aus Aufträgen (Erstgespräch, Ausführung) stehen schon in den
-- Aufträgen; hier kommen eigene Termine dazu (z. B. Steuerberatung).

-- ---------------------------------------------------------------------------
-- Eigene Termine
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text check (char_length(location) <= 500),
  customer_id uuid references public.customers (id) on delete set null,
  notes text check (char_length(notes) <= 5000),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists appointments_user_idx on public.appointments (user_id, starts_at);

alter table public.appointments enable row level security;

drop policy if exists "appointments_select_own" on public.appointments;
create policy "appointments_select_own" on public.appointments
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "appointments_insert_own" on public.appointments;
create policy "appointments_insert_own" on public.appointments
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (customer_id is null or exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())))
  );
drop policy if exists "appointments_update_own" on public.appointments;
create policy "appointments_update_own" on public.appointments
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and (customer_id is null or exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())))
  );
drop policy if exists "appointments_delete_own" on public.appointments;
create policy "appointments_delete_own" on public.appointments
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.appointments to authenticated;

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Kalender-Abo: geheimer Link, über den Apple/Google Kalender die Termine
-- abholen. Wer den Link kennt, sieht die Termine – deshalb lang und zufällig,
-- jederzeit erneuerbar (neuer Link) oder löschbar.
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_feeds (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique check (char_length(token) between 32 and 128 and token ~ '^[A-Za-z0-9_-]+$'),
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

drop policy if exists "calendar_feeds_select_own" on public.calendar_feeds;
create policy "calendar_feeds_select_own" on public.calendar_feeds
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "calendar_feeds_insert_own" on public.calendar_feeds;
create policy "calendar_feeds_insert_own" on public.calendar_feeds
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "calendar_feeds_update_own" on public.calendar_feeds;
create policy "calendar_feeds_update_own" on public.calendar_feeds
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "calendar_feeds_delete_own" on public.calendar_feeds;
create policy "calendar_feeds_delete_own" on public.calendar_feeds
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.calendar_feeds to authenticated;

-- Termine für das Kalender-Abo (nur mit gültigem Link; Zeitraum: 90 Tage zurück bis 1 Jahr voraus).
-- Läuft mit erweiterten Rechten, gibt aber ausschließlich die Termine des Link-Inhabers heraus.
create or replace function public.calendar_feed(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with feed as (
    select f.user_id
    from public.calendar_feeds f
    where p_token is not null and char_length(p_token) >= 32 and f.token = p_token
  )
  select case
    when not exists (select 1 from feed) then null
    else jsonb_build_object(
      'name', coalesce(
        (select nullif(trim(coalesce(nullif(trim(b.company_name), ''), b.owner_name)), '')
         from public.business_settings b where b.user_id = (select user_id from feed)),
        'NEXORA'),
      'orders', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id,
          'title', o.title,
          'meeting_at', o.meeting_at,
          'meeting_done', o.meeting_done,
          'execution_at', o.execution_at,
          'completed', o.completed,
          'customer', c.name,
          'address', c.address,
          'phone', c.phone))
        from public.orders o
        join public.customers c on c.id = o.customer_id
        where o.user_id = (select user_id from feed)
          and not o.cancelled
          and (
            o.meeting_at between now() - interval '90 days' and now() + interval '366 days'
            or o.execution_at between now() - interval '90 days' and now() + interval '366 days'
          )), '[]'::jsonb),
      'appointments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'title', a.title,
          'starts_at', a.starts_at,
          'ends_at', a.ends_at,
          'all_day', a.all_day,
          'location', coalesce(a.location, c.address),
          'notes', a.notes,
          'customer', c.name))
        from public.appointments a
        left join public.customers c on c.id = a.customer_id
        where a.user_id = (select user_id from feed)
          and a.starts_at between now() - interval '90 days' and now() + interval '366 days'), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
