-- NEXORA: Einführungen (Tutorials) je Bereich
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: das Profil-Skript (20261102120000_profiles.sql).

-- Welche Einführungen der Nutzer schon gesehen hat (z. B. {home,kunden})
alter table public.profiles add column if not exists tutorials_done text[] not null default '{}';
-- Einführungen nicht mehr automatisch zeigen (über "?" weiter abrufbar)
alter table public.profiles add column if not exists tutorials_off boolean not null default false;

alter table public.profiles drop constraint if exists profiles_tutorials_done_check;
alter table public.profiles add constraint profiles_tutorials_done_check
  check (cardinality(tutorials_done) <= 50 and array_position(tutorials_done, null) is null);
