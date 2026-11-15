-- Lunaxora: Feinschliff (November 2026)
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run. Mehrfaches Ausführen schadet nicht.
-- Voraussetzung: alle bisherigen Skripte (bis 20261119090000_customer_invites.sql).
--
-- Was dazukommt:
--  1. Profil: eigene Branche („Etwas anderes“), Rechtsform, gewähltes Abo, Design
--  2. Firma: Rechtsform + Pflichtangaben (Gesellschafter, Geschäftsführer, Register)
--  3. Gutscheine (z. B. 3 Monate Pro für die Warteliste) – 20 Codes werden erzeugt
--  4. Ein Gerät gleichzeitig pro Konto (Pro / Business / Testphase)
--  5. Business-Team: bis zu 5 Personen teilen sich ein Business (gleiche Daten)
--  6. Inventar
--  7. Termine: „draußen“ (für das Wetter im Kalender)
--
-- Nach dem Ausführen die Gutscheincodes ansehen:
--   select code from public.vouchers where note = 'Warteliste' order by code;

-- ---------------------------------------------------------------------------
-- 1. Profil
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists industry_other text check (char_length(industry_other) <= 80);
alter table public.profiles add column if not exists legal_form text;
alter table public.profiles drop constraint if exists profiles_legal_form_check;
alter table public.profiles add constraint profiles_legal_form_check
  check (legal_form is null or legal_form in ('none', 'sole', 'freelance', 'gbr', 'ug', 'gmbh'));
alter table public.profiles add column if not exists chosen_plan text;
alter table public.profiles drop constraint if exists profiles_chosen_plan_check;
alter table public.profiles add constraint profiles_chosen_plan_check
  check (chosen_plan is null or chosen_plan in ('free', 'pro', 'business'));
alter table public.profiles add column if not exists design jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Firma: Rechtsform und Pflichtangaben auf Rechnungen
-- ---------------------------------------------------------------------------
alter table public.business_settings add column if not exists legal_form text;
alter table public.business_settings drop constraint if exists business_settings_legal_form_check;
alter table public.business_settings add constraint business_settings_legal_form_check
  check (legal_form is null or legal_form in ('none', 'sole', 'freelance', 'gbr', 'ug', 'gmbh'));
-- GbR: alle Gesellschafter; UG/GmbH: Geschäftsführer, Registergericht, HRB-Nummer
alter table public.business_settings add column if not exists partners text check (char_length(partners) <= 300);
alter table public.business_settings add column if not exists managing_director text check (char_length(managing_director) <= 200);
alter table public.business_settings add column if not exists register_court text check (char_length(register_court) <= 120);
alter table public.business_settings add column if not exists register_number text check (char_length(register_number) <= 60);

-- ---------------------------------------------------------------------------
-- 3. Gutscheine
-- ---------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check
  check (source in ('trial', 'manual', 'apple', 'google', 'stripe', 'voucher'));

create table if not exists public.vouchers (
  code text primary key check (code ~ '^[A-Z0-9-]{4,24}$'),
  months integer not null default 3 check (months between 1 and 24),
  tier text not null default 'pro' check (tier in ('pro', 'business')),
  note text,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Nur über redeem_voucher() – niemand kann die Liste lesen
alter table public.vouchers enable row level security;
revoke all on public.vouchers from anon, authenticated;

-- 20 Einmal-Codes für die Warteliste (nur beim ersten Ausführen)
insert into public.vouchers (code, months, tier, note)
select 'LUNA-' || upper(substr(md5(random()::text || clock_timestamp()::text || g::text), 1, 6)), 3, 'pro', 'Warteliste'
from generate_series(1, 20) as g
where not exists (select 1 from public.vouchers where note = 'Warteliste')
on conflict do nothing;

create or replace function public.redeem_voucher(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v public.vouchers;
  s public.subscriptions;
  until timestamptz;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  select * into v from public.vouchers where code = upper(trim(p_code)) for update;
  if not found then raise exception 'voucher_invalid' using errcode = 'PT404'; end if;
  if v.redeemed_by is not null then raise exception 'voucher_used' using errcode = 'PT409'; end if;
  perform public.nexora_ensure_subscription(uid);
  select * into s from public.subscriptions where user_id = uid for update;
  if s.source = 'stripe' and s.status = 'active' then raise exception 'voucher_paid' using errcode = 'PT409'; end if;
  until := greatest(now(), coalesce(case when s.status = 'active' then s.current_period_end end, now()))
           + make_interval(months => v.months);
  update public.subscriptions
     set status = 'active', tier = v.tier, source = 'voucher', current_period_end = until, updated_at = now()
   where user_id = uid;
  update public.vouchers set redeemed_by = uid, redeemed_at = now() where code = v.code;
  return jsonb_build_object('months', v.months, 'tier', v.tier, 'until', until);
end;
$$;
revoke all on function public.redeem_voucher(text) from public, anon;
grant execute on function public.redeem_voucher(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5a. Business-Team: wer gehört zu wessen Business?
--     (vor Teil 4, weil die Geräte-Prüfung das Abo des Teams braucht)
-- ---------------------------------------------------------------------------
create table if not exists public.team_members (
  member_id uuid primary key references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  check (member_id <> owner_id)
);
create index if not exists team_members_owner_idx on public.team_members (owner_id);
alter table public.team_members enable row level security;
revoke all on public.team_members from anon, authenticated;

create table if not exists public.team_invites (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  email text check (char_length(email) <= 200),
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);
alter table public.team_invites enable row level security;
revoke all on public.team_invites from anon, authenticated;

-- Wessen Daten sieht der angemeldete Nutzer? Teammitglied -> die des Inhabers, sonst die eigenen.
create or replace function public.nexora_workspace()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select owner_id from public.team_members where member_id = auth.uid()), auth.uid());
$$;
revoke all on function public.nexora_workspace() from public, anon;
grant execute on function public.nexora_workspace() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ein Gerät gleichzeitig
-- ---------------------------------------------------------------------------
create table if not exists public.account_devices (
  user_id uuid primary key references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 80),
  device_name text check (char_length(device_name) <= 80),
  claimed_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
alter table public.account_devices enable row level security;
revoke all on public.account_devices from anon, authenticated;

-- Dieses Gerät zum aktiven machen (beim Anmelden oder „Hier weiter nutzen“)
create or replace function public.device_claim(p_device text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  insert into public.account_devices (user_id, device_id, device_name, claimed_at, seen_at)
  values (uid, p_device, left(p_name, 80), now(), now())
  on conflict (user_id) do update
    set device_id = excluded.device_id, device_name = excluded.device_name, claimed_at = now(), seen_at = now();
end;
$$;

-- Darf dieses Gerät gerade? Gratis: immer. Sonst nur das zuletzt angemeldete Gerät.
create or replace function public.device_status(p_device text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d public.account_devices;
  plan text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  plan := public.nexora_plan(public.nexora_workspace());
  select * into d from public.account_devices where user_id = uid;
  if not found then
    perform public.device_claim(p_device, null);
    return jsonb_build_object('active', true, 'limited', plan <> 'free');
  end if;
  if d.device_id = p_device then
    update public.account_devices set seen_at = now() where user_id = uid;
    return jsonb_build_object('active', true, 'limited', plan <> 'free');
  end if;
  return jsonb_build_object('active', plan = 'free', 'limited', plan <> 'free', 'other', d.device_name, 'since', d.claimed_at);
end;
$$;
revoke all on function public.device_claim(text, text) from public, anon;
revoke all on function public.device_status(text) from public, anon;
grant execute on function public.device_claim(text, text) to authenticated;
grant execute on function public.device_status(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5b. Business-Team: Einladen, Beitreten, Verlassen
-- ---------------------------------------------------------------------------

-- Inhaber (Business) erstellt einen Einladungscode für eine Person
create or replace function public.team_invite(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  used integer;
  new_code text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if exists (select 1 from public.team_members where member_id = uid) then
    raise exception 'team_member_cannot_invite' using errcode = 'PT403';
  end if;
  -- Business (in der Testphase zum Ausprobieren ebenfalls)
  if public.nexora_plan(uid) not in ('business', 'trial') then raise exception 'business_required' using errcode = 'PT402'; end if;
  select 1 + (select count(*) from public.team_members where owner_id = uid)
           + (select count(*) from public.team_invites where owner_id = uid and accepted_by is null)
    into used;
  if used >= 5 then raise exception 'team_full' using errcode = 'PT409'; end if;
  loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.team_invites where code = new_code);
  end loop;
  insert into public.team_invites (code, owner_id, email) values (new_code, uid, nullif(trim(p_email), ''));
  return new_code;
end;
$$;

-- Mit Code einem Team beitreten (eigene Daten bleiben gespeichert, sind aber im Team nicht sichtbar)
create or replace function public.team_join(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.team_invites;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  select * into inv from public.team_invites where code = upper(trim(p_code)) for update;
  if not found or inv.accepted_by is not null then raise exception 'invite_invalid' using errcode = 'PT404'; end if;
  if inv.owner_id = uid then raise exception 'invite_own' using errcode = 'PT409'; end if;
  if exists (select 1 from public.team_members where owner_id = uid) then
    raise exception 'owner_has_team' using errcode = 'PT409';
  end if;
  insert into public.team_members (member_id, owner_id) values (uid, inv.owner_id)
  on conflict (member_id) do update set owner_id = excluded.owner_id, joined_at = now();
  update public.team_invites set accepted_by = uid, accepted_at = now() where code = inv.code;
  return jsonb_build_object('owner_id', inv.owner_id,
    'owner_name', (select coalesce(business_name, display_name) from public.profiles where id = inv.owner_id));
end;
$$;

-- Team verlassen (Mitglied) bzw. jemanden entfernen / Einladung zurückziehen (Inhaber)
create or replace function public.team_leave()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.team_members where member_id = auth.uid();
$$;

create or replace function public.team_remove(p_member uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.team_members where member_id = p_member and owner_id = auth.uid();
$$;

create or replace function public.team_revoke(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.team_invites where code = p_code and owner_id = auth.uid() and accepted_by is null;
$$;

-- Übersicht für die App: Rolle, Inhaber, Mitglieder, offene Einladungen
create or replace function public.my_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  owner := public.nexora_workspace();
  return jsonb_build_object(
    'role', case when owner <> uid then 'member'
                 when exists (select 1 from public.team_members where owner_id = uid) then 'owner'
                 else 'solo' end,
    'owner_id', owner,
    'owner_name', (select coalesce(nullif(business_name, ''), display_name) from public.profiles where id = owner),
    'seats', 5,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', coalesce(p.display_name, split_part(u.email, '@', 1)),
        'email', u.email,
        'owner', u.id = owner,
        'joined_at', m.joined_at) order by (u.id = owner) desc, m.joined_at)
      from auth.users u
      left join public.team_members m on m.member_id = u.id
      left join public.profiles p on p.id = u.id
      where u.id = owner or m.owner_id = owner), '[]'::jsonb),
    'invites', case when owner = uid then coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'email', email, 'created_at', created_at) order by created_at)
      from public.team_invites where owner_id = uid and accepted_by is null), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.team_invite(text) from public, anon;
revoke all on function public.team_join(text) from public, anon;
revoke all on function public.team_leave() from public, anon;
revoke all on function public.team_remove(uuid) from public, anon;
revoke all on function public.team_revoke(text) from public, anon;
revoke all on function public.my_team() from public, anon;
grant execute on function public.team_invite(text) to authenticated;
grant execute on function public.team_join(text) to authenticated;
grant execute on function public.team_leave() to authenticated;
grant execute on function public.team_remove(uuid) to authenticated;
grant execute on function public.team_revoke(text) to authenticated;
grant execute on function public.my_team() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Inventar (gehört zum Business – im Team sehen alle dasselbe)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.nexora_workspace() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  category text check (char_length(category) <= 80),
  brand text check (char_length(brand) <= 80),
  price numeric(12, 2) check (price >= 0),
  quantity integer not null default 1 check (quantity >= 0),
  status text not null default 'in_betrieb'
    check (status in ('in_betrieb', 'reparatur', 'defekt', 'bestellt', 'verkauft')),
  location text check (char_length(location) <= 120),
  serial_number text check (char_length(serial_number) <= 120),
  purchase_date date,
  product_url text check (char_length(product_url) <= 600),
  shop text check (char_length(shop) <= 80),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_items_user_idx on public.inventory_items (user_id, created_at desc);
alter table public.inventory_items enable row level security;
drop policy if exists "inventory_select_own" on public.inventory_items;
create policy "inventory_select_own" on public.inventory_items
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "inventory_insert_own" on public.inventory_items;
create policy "inventory_insert_own" on public.inventory_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "inventory_update_own" on public.inventory_items;
create policy "inventory_update_own" on public.inventory_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "inventory_delete_own" on public.inventory_items;
create policy "inventory_delete_own" on public.inventory_items
  for delete to authenticated using ((select auth.uid()) = user_id);
drop trigger if exists inventory_items_updated_at on public.inventory_items;
create trigger inventory_items_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.inventory_items to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Termine: draußen? (Wetter im Kalender)
-- ---------------------------------------------------------------------------
alter table public.appointments add column if not exists outdoor boolean not null default false;

-- ---------------------------------------------------------------------------
-- 5c. Business-Team: alle Business-Daten über nexora_workspace() statt auth.uid()
--
-- Geteilt werden Kunden, Aufträge, Angebote/Rechnungen, Firma, Logo, Termine,
-- Finanzen, Belege, To-dos, Ziele, Social-Posts, Hashtags, Inventar.
-- Persönlich bleiben: Profil, Fahrplan-Häkchen, verbundene Social-Konten (Tokens), Abo.
-- Ohne Team ist nexora_workspace() = auth.uid() – für Einzelnutzer ändert sich nichts.
-- ---------------------------------------------------------------------------
do $$
declare
  shared text[] := array[
    'customers', 'orders', 'documents', 'document_counters', 'business_settings', 'business_logos',
    'appointments', 'calendar_feeds', 'expenses', 'invoice_followups', 'email_log', 'todos', 'goals',
    'social_posts', 'hashtag_sets', 'customer_invites', 'inventory_items'];
  t text;
  r record;
  q text;
  c text;
begin
  foreach t in array shared loop
    if to_regclass('public.' || t) is null then continue; end if;
    -- neue Zeilen gehören dem Business (Inhaber), nicht der einzelnen Person
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      execute format('alter table public.%I alter column user_id set default public.nexora_workspace()', t);
    end if;
    for r in select * from pg_policies where schemaname = 'public' and tablename = t loop
      q := replace(r.qual, 'auth.uid()', 'public.nexora_workspace()');
      c := replace(r.with_check, 'auth.uid()', 'public.nexora_workspace()');
      if q is not distinct from r.qual and c is not distinct from r.with_check then continue; end if;
      execute format('drop policy %I on public.%I', r.policyname, t);
      execute format('create policy %I on public.%I as %s for %s to %s%s%s',
        r.policyname, t, r.permissive, r.cmd,
        (select string_agg(quote_ident(x), ', ') from unnest(r.roles) as x),
        case when q is not null then ' using (' || q || ')' else '' end,
        case when c is not null then ' with check (' || c || ')' else '' end);
    end loop;
  end loop;

  -- Belege im Speicher: Ordner des Business statt der Person
  for r in select * from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'receipts_%' loop
    q := replace(r.qual, 'auth.uid()', 'public.nexora_workspace()');
    c := replace(r.with_check, 'auth.uid()', 'public.nexora_workspace()');
    if q is not distinct from r.qual and c is not distinct from r.with_check then continue; end if;
    execute format('drop policy %I on storage.objects', r.policyname);
    execute format('create policy %I on storage.objects as %s for %s to %s%s%s',
      r.policyname, r.permissive, r.cmd,
      (select string_agg(quote_ident(x), ', ') from unnest(r.roles) as x),
      case when q is not null then ' using (' || q || ')' else '' end,
      case when c is not null then ' with check (' || c || ')' else '' end);
  end loop;

  -- Funktionen, die Daten bzw. Abo des Business brauchen (Nummernkreise, Abo, Kontingent, Pro-Prüfung)
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('issue_document', 'my_plan', 'consume_quota', 'refund_quota', 'nexora_require_pro')
      and p.prosrc like '%auth.uid()%'
  loop
    execute replace(pg_get_functiondef(r.oid), 'auth.uid()', 'public.nexora_workspace()');
  end loop;
end;
$$;

-- Business-Kontingent gilt fürs ganze Team (5 Personen)
create or replace function public.nexora_limit(p_plan text, p_kind text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'business' then case p_kind when 'nexy' then 500 when 'receipt' then 250 else 600 end
    when 'pro'      then case p_kind when 'nexy' then 100 when 'receipt' then 50  else 120 end
    when 'trial'    then case p_kind when 'nexy' then 50  when 'receipt' then 20  else 70  end
    else                 case p_kind when 'nexy' then 15  when 'receipt' then 3   else 30  end
  end;
$$;
