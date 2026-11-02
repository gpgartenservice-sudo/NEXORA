-- NEXORA: Kunden und Aufträge
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.

-- ---------------------------------------------------------------------------
-- Kunden
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  company text check (char_length(company) <= 120),
  phone text check (char_length(phone) <= 60),
  email text check (char_length(email) <= 160),
  address text check (char_length(address) <= 300),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_user_idx on public.customers (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Aufträge (Status wird in der App aus den Feldern berechnet)
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Ein Kunde mit Aufträgen kann nicht gelöscht werden ("no action" statt
  -- "restrict", damit beim Löschen eines ganzen Kontos alles sauber mitgeht)
  customer_id uuid not null references public.customers (id) on delete no action,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  price numeric(12, 2) check (price >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent between 0 and 100),
  billing text not null default 'once' check (billing in ('once', 'monthly')),
  contract_start date,
  contract_end date check (contract_end is null or contract_start is null or contract_end >= contract_start),
  meeting_at timestamptz,
  meeting_done boolean not null default false,
  offer_sent boolean not null default false,
  offer_accepted boolean not null default false,
  execution_at timestamptz,
  completed boolean not null default false,
  cancelled boolean not null default false,
  expenses numeric(12, 2) check (expenses >= 0),
  internal_notes text check (char_length(internal_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders (user_id, updated_at desc);
create index if not exists orders_customer_idx on public.orders (customer_id);

-- ---------------------------------------------------------------------------
-- Zugriff: jeder sieht und ändert nur seine eigenen Kunden und Aufträge
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.orders enable row level security;

drop policy if exists "customers_select_own" on public.customers;
create policy "customers_select_own" on public.customers
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "customers_insert_own" on public.customers;
create policy "customers_insert_own" on public.customers
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "customers_update_own" on public.customers;
create policy "customers_update_own" on public.customers
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "customers_delete_own" on public.customers;
create policy "customers_delete_own" on public.customers
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Aufträge dürfen nur mit EIGENEN Kunden verknüpft werden
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid()))
  );
drop policy if exists "orders_update_own" on public.orders;
create policy "orders_update_own" on public.orders
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid()))
  );
drop policy if exists "orders_delete_own" on public.orders;
create policy "orders_delete_own" on public.orders
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.orders to authenticated;

-- updated_at automatisch setzen (Funktion stammt aus dem Profil-Skript)
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();
