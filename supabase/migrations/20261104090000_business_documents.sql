-- NEXORA: Firmendaten, Angebote und Rechnungen
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.

-- ---------------------------------------------------------------------------
-- Firmendaten (erscheinen auf Angeboten und Rechnungen) – eine Zeile pro Nutzer
-- ---------------------------------------------------------------------------
create table if not exists public.business_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  company_name text check (char_length(company_name) <= 160),
  owner_name text check (char_length(owner_name) <= 160),
  street text check (char_length(street) <= 160),
  zip text check (char_length(zip) <= 20),
  city text check (char_length(city) <= 120),
  phone text check (char_length(phone) <= 60),
  email text check (char_length(email) <= 160),
  website text check (char_length(website) <= 200),
  tax_number text check (char_length(tax_number) <= 60),
  vat_id text check (char_length(vat_id) <= 30),
  -- Kleinunternehmerregelung nach § 19 UStG (keine Umsatzsteuer)
  small_business boolean not null default true,
  vat_rate numeric(4, 2) not null default 19 check (vat_rate >= 0 and vat_rate < 100),
  bank_name text check (char_length(bank_name) <= 120),
  iban text check (char_length(iban) <= 42),
  bic text check (char_length(bic) <= 11),
  payment_days integer not null default 14 check (payment_days between 0 and 120),
  offer_validity_days integer not null default 30 check (offer_validity_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_settings enable row level security;

drop policy if exists "business_select_own" on public.business_settings;
create policy "business_select_own" on public.business_settings
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "business_insert_own" on public.business_settings;
create policy "business_insert_own" on public.business_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "business_update_own" on public.business_settings;
create policy "business_update_own" on public.business_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on public.business_settings to authenticated;

drop trigger if exists business_settings_set_updated_at on public.business_settings;
create trigger business_settings_set_updated_at
  before update on public.business_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Angebote und Rechnungen
--
-- Ein Dokument wird beim Erstellen mit allen Angaben "eingefroren" (data):
-- Firmendaten, Kunde, Positionen, Beträge. So sieht eine Rechnung auch
-- später noch genauso aus wie beim Erstellen – auch wenn sich Kunde oder
-- Auftrag ändern. Rechnungen lassen sich nicht löschen oder ändern
-- (nur als bezahlt markieren).
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  kind text not null check (kind in ('offer', 'invoice')),
  number text not null,
  issued_on date not null,
  -- Rechnung: zahlbar bis · Angebot: gültig bis
  due_on date,
  total numeric(12, 2) not null check (total >= 0),
  data jsonb not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, number)
);

create index if not exists documents_user_idx on public.documents (user_id, created_at desc);
create index if not exists documents_order_idx on public.documents (order_id);

alter table public.documents enable row level security;

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own" on public.documents
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Lesen ja; ändern NUR "bezahlt am"; anlegen nur über issue_document(); löschen gar nicht
grant select on public.documents to authenticated;
grant update (paid_at) on public.documents to authenticated;

-- Zähler für fortlaufende Nummern (pro Nutzer, Art und Jahr)
create table if not exists public.document_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('offer', 'invoice')),
  year integer not null,
  last_number integer not null,
  primary key (user_id, kind, year)
);

alter table public.document_counters enable row level security;
drop policy if exists "counters_select_own" on public.document_counters;
create policy "counters_select_own" on public.document_counters
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.document_counters to authenticated;

-- ---------------------------------------------------------------------------
-- Dokument erstellen: vergibt die nächste Nummer (AN-2026-0001 / RE-2026-0001)
-- und speichert das Dokument – in einem Schritt, damit keine Nummer doppelt
-- vergeben wird und keine Lücken entstehen.
-- ---------------------------------------------------------------------------
create or replace function public.issue_document(
  p_order_id uuid,
  p_kind text,
  p_data jsonb,
  p_total numeric,
  p_due_on date
)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_year integer := extract(year from v_today)::integer;
  v_customer uuid;
  v_no integer;
  v_doc public.documents;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_kind not in ('offer', 'invoice') then
    raise exception 'Unbekannte Dokumentart' using errcode = '22023';
  end if;
  if p_total is null or p_total < 0 then
    raise exception 'Ungültiger Betrag' using errcode = '22023';
  end if;

  select o.customer_id into v_customer
  from public.orders o
  where o.id = p_order_id and o.user_id = v_uid;
  if not found then
    raise exception 'Auftrag nicht gefunden' using errcode = 'P0002';
  end if;

  insert into public.document_counters as c (user_id, kind, year, last_number)
  values (v_uid, p_kind, v_year, 1)
  on conflict (user_id, kind, year) do update set last_number = c.last_number + 1
  returning last_number into v_no;

  insert into public.documents (user_id, order_id, customer_id, kind, number, issued_on, due_on, total, data)
  values (
    v_uid,
    p_order_id,
    v_customer,
    p_kind,
    (case p_kind when 'offer' then 'AN' else 'RE' end) || '-' || v_year || '-' || lpad(v_no::text, 4, '0'),
    v_today,
    p_due_on,
    round(p_total, 2),
    p_data
  )
  returning * into v_doc;

  return v_doc;
end;
$$;

revoke all on function public.issue_document(uuid, text, jsonb, numeric, date) from public;
revoke all on function public.issue_document(uuid, text, jsonb, numeric, date) from anon;
grant execute on function public.issue_document(uuid, text, jsonb, numeric, date) to authenticated;
