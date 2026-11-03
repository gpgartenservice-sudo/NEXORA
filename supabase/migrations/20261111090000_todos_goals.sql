-- NEXORA: To-dos & Ziele
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: das Skript für Kunden & Aufträge (20261103120000_customers_orders.sql).

-- ---------------------------------------------------------------------------
-- To-dos: Aufgaben mit optionaler Fälligkeit, optional zu einem Kunden
-- oder Auftrag. Beim Abhaken merkt sich die Datenbank, wann.
-- ---------------------------------------------------------------------------
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  notes text check (char_length(notes) <= 2000),
  due_on date,
  important boolean not null default false,
  done boolean not null default false,
  done_at timestamptz,
  customer_id uuid references public.customers (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todos_user_idx on public.todos (user_id, done, due_on);

alter table public.todos enable row level security;

drop policy if exists "todos_select_own" on public.todos;
create policy "todos_select_own" on public.todos
  for select to authenticated using ((select auth.uid()) = user_id);
-- Kunde und Auftrag nur aus dem eigenen Bestand
drop policy if exists "todos_insert_own" on public.todos;
create policy "todos_insert_own" on public.todos
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (customer_id is null or exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())))
    and (order_id is null or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())))
  );
drop policy if exists "todos_update_own" on public.todos;
create policy "todos_update_own" on public.todos
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and (customer_id is null or exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())))
    and (order_id is null or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())))
  );
drop policy if exists "todos_delete_own" on public.todos;
create policy "todos_delete_own" on public.todos
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.todos to authenticated;

-- Zeitpunkt des Abhakens setzen bzw. beim Wieder-Öffnen löschen
create or replace function public.todos_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
  elsif not new.done then
    new.done_at := null;
  elsif tg_op = 'UPDATE' then
    new.done_at := old.done_at;
  end if;
  return new;
end;
$$;

drop trigger if exists todos_set_done_at on public.todos;
create trigger todos_set_done_at
  before insert or update on public.todos
  for each row execute function public.todos_done_at();

drop trigger if exists todos_set_updated_at on public.todos;
create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ziele
--   revenue   = Umsatz (Euro) im Monat/Jahr
--   customers = neue Kunden je Woche/Monat/Jahr
--   orders    = abgeschlossene Aufträge je Woche/Monat/Jahr
--   posts     = veröffentlichte Posts je Woche/Monat/Jahr
--   custom    = eigenes Ziel mit Titel; Fortschritt trägt man selbst ein
--               (einmalig, optional mit Termin)
-- Der Fortschritt der übrigen Ziele kommt aus den echten Zahlen der App.
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('revenue', 'customers', 'orders', 'posts', 'custom')),
  period text not null check (period in ('week', 'month', 'year', 'once')),
  target numeric(12, 2) not null check (target > 0 and target <= 100000000),
  title text check (char_length(title) <= 120),
  progress numeric(12, 2) not null default 0 check (progress >= 0 and progress <= 100000000),
  due_on date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- eigene Ziele sind einmalig und brauchen einen Titel; die anderen gelten je Zeitraum
  check ((kind = 'custom') = (period = 'once')),
  check (kind <> 'custom' or char_length(trim(coalesce(title, ''))) > 0),
  -- Umsatz gibt es pro Monat bzw. Jahr (monatliche Verträge werden monatsweise gezählt)
  check (kind <> 'revenue' or period in ('month', 'year'))
);

create index if not exists goals_user_idx on public.goals (user_id, archived);

alter table public.goals enable row level security;

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own" on public.goals
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own" on public.goals
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.goals to authenticated;

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();
