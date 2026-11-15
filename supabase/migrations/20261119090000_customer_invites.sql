-- Lunaxora: Neue Kunden tragen ihre Daten selbst ein (Datenschutz-Link)
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: 20261103120000_customers_orders.sql, 20261104090000_business_documents.sql,
-- 20261105090000_business_logo.sql und 20261113090000_offer_links_mail.sql.
--
-- Ablauf: Der Nutzer gibt beim neuen Kunden nur die E-Mail-Adresse ein ->
-- Lunaxora schickt einen Link (https://lunaxora.de/Kunde/?einladung=…) ->
-- der Kunde trägt dort seine Daten ein und bestätigt die Datenschutzerklärung
-- -> erst beim Abschicken entsteht der Kunde in Lunaxora. Vorher speichert
-- Lunaxora nur die E-Mail-Adresse (für den Link).

-- ---------------------------------------------------------------------------
-- 1. Link zur eigenen Datenschutzerklärung (optional). Fehlt er, zeigt die
--    Kundenseite ein Muster mit den Firmendaten des Nutzers.
-- ---------------------------------------------------------------------------
alter table public.business_settings add column if not exists privacy_url text;
alter table public.business_settings drop constraint if exists business_settings_privacy_url_check;
alter table public.business_settings add constraint business_settings_privacy_url_check
  check (privacy_url is null or (char_length(privacy_url) <= 500 and privacy_url ~ '^https://\S+$'));

-- ---------------------------------------------------------------------------
-- 2. Nachweis am Kunden: wann er die Datenschutzerklärung bestätigt hat und
--    welche (Link oder Muster)
-- ---------------------------------------------------------------------------
alter table public.customers add column if not exists privacy_confirmed_at timestamptz;
alter table public.customers add column if not exists privacy_reference text;
alter table public.customers drop constraint if exists customers_privacy_reference_check;
alter table public.customers add constraint customers_privacy_reference_check
  check (privacy_reference is null or char_length(privacy_reference) <= 500);

-- ---------------------------------------------------------------------------
-- 3. Einladungen: E-Mail-Adresse + langer, geheimer Link
-- ---------------------------------------------------------------------------
create table if not exists public.customer_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null check (
    char_length(email) between 3 and 160
    and email ~ '^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$'
  ),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  completed_at timestamptz,
  customer_id uuid references public.customers (id) on delete set null
);

create index if not exists customer_invites_user_idx on public.customer_invites (user_id, created_at desc);
-- je E-Mail-Adresse nur eine offene Einladung
create unique index if not exists customer_invites_open_email_idx
  on public.customer_invites (user_id, lower(email)) where completed_at is null;

alter table public.customer_invites enable row level security;

drop policy if exists "customer_invites_select_own" on public.customer_invites;
create policy "customer_invites_select_own" on public.customer_invites
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "customer_invites_insert_own" on public.customer_invites;
create policy "customer_invites_insert_own" on public.customer_invites
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "customer_invites_update_own" on public.customer_invites;
create policy "customer_invites_update_own" on public.customer_invites
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "customer_invites_delete_own" on public.customer_invites;
create policy "customer_invites_delete_own" on public.customer_invites
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Die App legt Einladungen an (nur E-Mail + Link), verschickt sie erneut
-- (Versandzeit, Ablaufdatum) und löscht sie. "Erledigt" setzt nur die Funktion unten.
revoke all on public.customer_invites from anon, authenticated;
grant select, delete on public.customer_invites to authenticated;
grant insert (email, token) on public.customer_invites to authenticated;
grant update (sent_at, expires_at) on public.customer_invites to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Kundenseite: Einladung ansehen (Firmendaten für Kopf und
--    Datenschutzerklärung) und Daten abschicken – ohne Anmeldung, nur mit Link
-- ---------------------------------------------------------------------------
create or replace function public.invite_view(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email', i.email,
    'expires_at', i.expires_at,
    'completed_at', i.completed_at,
    'expired', i.completed_at is null and i.expires_at < now(),
    'seller', jsonb_build_object(
      'company_name', b.company_name,
      'owner_name', b.owner_name,
      'street', b.street,
      'zip', b.zip,
      'city', b.city,
      'phone', b.phone,
      'email', b.email,
      'website', b.website,
      'privacy_url', b.privacy_url
    ),
    'logo', (
      select jsonb_build_object('mime', l.mime, 'data', l.data)
      from public.business_logos l
      where l.user_id = i.user_id and l.id = b.logo_id
    )
  )
  from public.customer_invites i
  left join public.business_settings b on b.user_id = i.user_id
  where p_token ~ '^[A-Za-z0-9_-]{32,64}$' and i.token = p_token;
$$;

create or replace function public.invite_submit(
  p_token text,
  p_name text,
  p_company text,
  p_phone text,
  p_street text,
  p_zip text,
  p_city text,
  p_privacy boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.customer_invites;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_company text := nullif(regexp_replace(trim(coalesce(p_company, '')), '\s+', ' ', 'g'), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_street text := regexp_replace(trim(coalesce(p_street, '')), '\s+', ' ', 'g');
  v_zip text := trim(coalesce(p_zip, ''));
  v_city text := regexp_replace(trim(coalesce(p_city, '')), '\s+', ' ', 'g');
  v_ref text;
  v_customer uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into i from public.customer_invites where token = p_token for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if i.completed_at is not null then return jsonb_build_object('error', 'already_done'); end if;
  if i.expires_at < now() then return jsonb_build_object('error', 'expired'); end if;
  if p_privacy is distinct from true then return jsonb_build_object('error', 'privacy_required'); end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then return jsonb_build_object('error', 'invalid_name'); end if;
  if v_company is not null and char_length(v_company) > 120 then return jsonb_build_object('error', 'invalid_company'); end if;
  if v_phone is not null and v_phone !~ '^[0-9 +()/.-]{3,60}$' then return jsonb_build_object('error', 'invalid_phone'); end if;
  if char_length(v_street) < 3 or char_length(v_street) > 160 then return jsonb_build_object('error', 'invalid_street'); end if;
  if v_zip !~ '^[0-9A-Za-z -]{3,10}$' then return jsonb_build_object('error', 'invalid_zip'); end if;
  if char_length(v_city) < 2 or char_length(v_city) > 120 then return jsonb_build_object('error', 'invalid_city'); end if;

  select b.privacy_url into v_ref from public.business_settings b where b.user_id = i.user_id;

  insert into public.customers (user_id, name, company, phone, email, address, privacy_confirmed_at, privacy_reference)
  values (
    i.user_id, v_name, v_company, v_phone, i.email,
    v_street || ', ' || v_zip || ' ' || v_city,
    now(),
    coalesce(v_ref, 'Muster-Datenschutzerklärung aus den Firmendaten (Lunaxora, Stand 11/2026)')
  )
  returning id into v_customer;

  update public.customer_invites set completed_at = now(), customer_id = v_customer where id = i.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.invite_view(text) from public;
revoke all on function public.invite_submit(text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.invite_view(text) to anon, authenticated;
grant execute on function public.invite_submit(text, text, text, text, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Versandprotokoll: neue Art "invite" (Datenschutz-Link)
-- ---------------------------------------------------------------------------
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('offer', 'invoice', 'reminder', 'review', 'invite', 'other'));
