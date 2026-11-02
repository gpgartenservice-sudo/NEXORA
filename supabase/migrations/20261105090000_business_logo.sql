-- NEXORA: Firmenlogo für Angebote und Rechnungen
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
--
-- Das Logo wird von der App verkleinert (max. 800 px, PNG oder JPG) und
-- direkt in der Datenbank gespeichert. Jede hochgeladene Version bleibt
-- unverändert: Ältere Angebote und Rechnungen werden so weiterhin mit dem
-- Logo erzeugt, das beim Erstellen galt.

create table if not exists public.business_logos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mime text not null check (mime in ('image/png', 'image/jpeg')),
  -- Bilddaten als Base64 (höchstens ca. 500 KB)
  data text not null check (char_length(data) between 16 and 700000 and data ~ '^[A-Za-z0-9+/]+={0,2}$'),
  width integer not null check (width between 1 and 2000),
  height integer not null check (height between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

alter table public.business_logos enable row level security;

drop policy if exists "logos_select_own" on public.business_logos;
create policy "logos_select_own" on public.business_logos
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "logos_insert_own" on public.business_logos;
create policy "logos_insert_own" on public.business_logos
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "logos_delete_own" on public.business_logos;
create policy "logos_delete_own" on public.business_logos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Hochladen, ansehen, löschen – ändern nicht (jede Version bleibt, wie sie ist)
grant select, insert, delete on public.business_logos to authenticated;

-- Aktuelles Logo in den Firmendaten (nur ein EIGENES Logo ist möglich)
alter table public.business_settings add column if not exists logo_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_settings_logo_fkey') then
    alter table public.business_settings
      add constraint business_settings_logo_fkey foreign key (user_id, logo_id)
      references public.business_logos (user_id, id) on delete set null (logo_id);
  end if;
end
$$;
