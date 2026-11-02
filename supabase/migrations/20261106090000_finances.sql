-- NEXORA: Finanzen – Ausgaben und Abschlussdatum von Aufträgen
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.

-- ---------------------------------------------------------------------------
-- Allgemeine Ausgaben (z. B. Software, Werkzeug, Versicherung) – einmalig,
-- monatlich oder jährlich wiederkehrend
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  category text not null default 'other'
    check (category in ('material', 'tools', 'software', 'marketing', 'vehicle', 'office', 'insurance', 'fees', 'education', 'other')),
  amount numeric(12, 2) not null check (amount > 0 and amount < 10000000),
  -- einmalig: Datum der Ausgabe · wiederkehrend: erste Zahlung
  spent_on date not null,
  repeat text not null default 'once' check (repeat in ('once', 'monthly', 'yearly')),
  -- wiederkehrend: letzte Zahlung (leer = läuft weiter)
  ends_on date check (ends_on is null or ends_on >= spent_on),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_idx on public.expenses (user_id, spent_on desc);

alter table public.expenses enable row level security;

drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own" on public.expenses
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own" on public.expenses
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own" on public.expenses
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.expenses to authenticated;

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Aufträge: Tag des Abschlusses merken (für die Monatsübersicht).
-- Wird automatisch gesetzt, wenn "Abgeschlossen" eingeschaltet wird.
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists completed_on date;

create or replace function public.orders_set_completed_on()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.completed then
    -- gerade abgeschlossen: heute merken (bleibt danach unverändert)
    if tg_op = 'INSERT' or not old.completed then
      new.completed_on := (now() at time zone 'Europe/Berlin')::date;
    end if;
  else
    new.completed_on := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_completed_on on public.orders;
create trigger orders_set_completed_on
  before insert or update on public.orders
  for each row execute function public.orders_set_completed_on();
