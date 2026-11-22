-- Teams-Abo, Rollen & Rechte, Team-Chats, Arbeitsplan, Urlaub & Krankmeldung
-- Voraussetzung: alle bisherigen Skripte (bis 20261127090000_mehrere_firmen.sql).
--
-- * Neues Abo „Teams“: bis zu 30 Personen (Inhaber, Mitgründer, Mitarbeiter), 349 € im Monat
--   bzw. 3.490 € im Jahr. Business bleibt bei 5 Personen. Admin-Konten (source = 'admin')
--   bekommen Teams.
-- * Rollen im Team (Business und Teams):
--     - Inhaber und Mitgründer = Arbeitgeber: sehen alles und verwalten das Team.
--     - Teamleitung und Mitarbeiter: der Admin stellt je Bereich „aus“, „ansehen“ oder
--       „bearbeiten“ ein (Vorlagen siehe nexora_role_default).
--   Die Datenbank prüft das selbst: Lesen über die Regeln (RLS), Schreiben über Trigger –
--   auch für Luna, die über dieselben Rechte wie die Person arbeitet.
--   Wer schon im Team ist, wird Mitgründer und behält damit vollen Zugriff wie bisher.
-- * Team-Chats: „Leitung“ (nur Arbeitgeber), „Alle“ und Direktnachrichten.
-- * Arbeitsplan (Schichten) und Abwesenheiten (Urlaub beantragen, krank melden, frei).
--   Kolleginnen und Kollegen sehen nur „abwesend“ – den Grund (z. B. krank) sehen nur
--   die Person selbst und wer Personal verwaltet.
--
-- Läuft als eine Transaktion: Klappt etwas nicht, bleibt alles wie vorher.

begin;

-- ---------------------------------------------------------------------------
-- 1. Abo-Stufe Teams
-- ---------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions add constraint subscriptions_tier_check check (tier in ('pro', 'business', 'teams'));

create or replace function public.nexora_plan(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.subscriptions;
begin
  -- Firma -> Konto des Inhabers (erste Firma: dieselbe ID)
  p_user := coalesce((select c.owner_id from public.companies c where c.id = p_user), p_user);
  select * into s from public.subscriptions where user_id = p_user;
  if not found then return 'free'; end if;
  if (s.status = 'active' and (s.current_period_end is null or s.current_period_end > now()))
     or (s.status = 'canceled' and s.current_period_end is not null and s.current_period_end > now()) then
    return case s.tier when 'business' then 'business' when 'teams' then 'teams' else 'pro' end;
  end if;
  if s.status = 'trial' and s.trial_ends_at is not null and s.trial_ends_at > now() then return 'trial'; end if;
  return 'free';
end;
$$;
revoke all on function public.nexora_plan(uuid) from public, anon, authenticated;

-- Kontingent je Monat – Teams fürs ganze Team (bis 30 Personen)
create or replace function public.nexora_limit(p_plan text, p_kind text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'teams'    then case p_kind when 'nexy' then 2000 when 'receipt' then 1000 else 2400 end
    when 'business' then case p_kind when 'nexy' then 500  when 'receipt' then 250  else 600  end
    when 'pro'      then case p_kind when 'nexy' then 100  when 'receipt' then 50   else 120  end
    when 'trial'    then case p_kind when 'nexy' then 50   when 'receipt' then 20   else 70   end
    else                 case p_kind when 'nexy' then 15   when 'receipt' then 3    else 30   end
  end;
$$;

-- Weitere Firmen gibt es auch mit Teams
create or replace function public.nexora_extra_allowed(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case when s.source = 'admin' then 50
                when public.nexora_plan(p_user) in ('pro', 'business', 'teams') then s.extra_companies
                else 0 end
      from public.subscriptions s where s.user_id = p_user), 0);
$$;
revoke all on function public.nexora_extra_allowed(uuid) from public, anon, authenticated;

-- Personen je Konto (Inhaber eingerechnet)
create or replace function public.nexora_seats(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case public.nexora_plan(p_user) when 'teams' then 30 else 5 end;
$$;
revoke all on function public.nexora_seats(uuid) from public, anon, authenticated;

-- Team-Funktionen (Chat, Arbeitsplan, Abwesenheiten) gibt es mit Business, Teams und in der Testphase
create or replace function public.nexora_team_plan(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.nexora_plan(p_company) in ('business', 'teams', 'trial');
$$;
revoke all on function public.nexora_team_plan(uuid) from public, anon, authenticated;

update public.subscriptions set tier = 'teams', updated_at = now() where source = 'admin';

-- Abo-Wahl im Onboarding
alter table public.profiles drop constraint if exists profiles_chosen_plan_check;
alter table public.profiles add constraint profiles_chosen_plan_check
  check (chosen_plan is null or chosen_plan in ('free', 'pro', 'business', 'teams'));

-- Kosten-Übersicht (falls eingerichtet): Teams-Preise und -Zahlungen
do $$
begin
  if to_regclass('kosten.abo_preise') is not null then
    alter table kosten.abo_preise drop constraint if exists abo_preise_stufe_check;
    alter table kosten.abo_preise add constraint abo_preise_stufe_check check (stufe in ('pro', 'business', 'teams'));
    insert into kosten.abo_preise (stufe, intervall, eur) values ('teams', 'month', 349.00), ('teams', 'year', 3490.00)
    on conflict do nothing;
  end if;
  if to_regclass('kosten.zahlungen') is not null then
    alter table kosten.zahlungen drop constraint if exists zahlungen_stufe_check;
    alter table kosten.zahlungen add constraint zahlungen_stufe_check check (stufe in ('pro', 'business', 'teams'));
  end if;
  if to_regprocedure('public.log_payment(uuid, numeric, text, text, text, text, text, timestamptz)') is not null then
    execute replace(pg_get_functiondef('public.log_payment(uuid, numeric, text, text, text, text, text, timestamptz)'::regprocedure),
                    'in (''pro'', ''business'') then p_stufe', 'in (''pro'', ''business'', ''teams'') then p_stufe');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Rollen und Rechte
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'team_members' and column_name = 'role') then
    -- Bisher sah jedes Mitglied alles – wer schon dabei ist, wird Mitgründer
    alter table public.team_members add column role text not null default 'mitgruender';
    alter table public.team_members alter column role set default 'mitarbeiter';
  end if;
end;
$$;
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check
  check (role in ('mitgruender', 'teamleitung', 'mitarbeiter'));
alter table public.team_members add column if not exists title text;
alter table public.team_members drop constraint if exists team_members_title_check;
alter table public.team_members add constraint team_members_title_check check (title is null or char_length(title) <= 60);
alter table public.team_members add column if not exists vacation_days numeric(4, 1) not null default 24;
alter table public.team_members drop constraint if exists team_members_vacation_days_check;
alter table public.team_members add constraint team_members_vacation_days_check check (vacation_days between 0 and 60);

alter table public.team_invites add column if not exists role text not null default 'mitarbeiter';
alter table public.team_invites drop constraint if exists team_invites_role_check;
alter table public.team_invites add constraint team_invites_role_check
  check (role in ('mitgruender', 'teamleitung', 'mitarbeiter'));

-- Vom Admin angepasste Rechte je Rolle und Firma (Rest: Vorlage)
create table if not exists public.team_roles (
  company_id uuid not null references public.companies (id) on delete cascade,
  role text not null check (role in ('teamleitung', 'mitarbeiter')),
  access jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (company_id, role)
);
alter table public.team_roles enable row level security;
revoke all on public.team_roles from anon, authenticated;

-- Vorlagen. Bereiche: kunden, auftraege, termine, aufgaben, dokumente (Angebote & Rechnungen),
-- finanzen, lager, social, firma, luna, fahrplan, personal (Arbeitsplan + Anträge verwalten).
-- Stufen: off / read / write (luna, fahrplan, personal nur off / write).
create or replace function public.nexora_role_default(p_role text)
returns jsonb
language sql
immutable
as $$
  select case p_role
    when 'teamleitung' then
      '{"kunden":"write","auftraege":"write","termine":"write","aufgaben":"write","dokumente":"write","finanzen":"off",
        "lager":"write","social":"write","firma":"read","luna":"write","fahrplan":"off","personal":"write"}'::jsonb
    when 'mitarbeiter' then
      '{"kunden":"read","auftraege":"read","termine":"read","aufgaben":"write","dokumente":"off","finanzen":"off",
        "lager":"write","social":"off","firma":"read","luna":"off","fahrplan":"off","personal":"off"}'::jsonb
    else
      '{"kunden":"write","auftraege":"write","termine":"write","aufgaben":"write","dokumente":"write","finanzen":"write",
        "lager":"write","social":"write","firma":"write","luna":"write","fahrplan":"write","personal":"write"}'::jsonb
  end;
$$;

-- Rolle einer Person in einer Firma: inhaber / mitgruender / teamleitung / mitarbeiter, sonst null
create or replace function public.nexora_member_role(p_company uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.companies c where c.id = p_company and c.owner_id = p_user) then 'inhaber'
    else (select m.role from public.team_members m where m.company_id = p_company and m.member_id = p_user)
  end;
$$;

-- Rechte einer Rolle in einer Firma (Vorlage + Anpassungen des Admins)
create or replace function public.nexora_role_access(p_company uuid, p_role text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.nexora_role_default(p_role)
         || case when p_role in ('teamleitung', 'mitarbeiter')
                 then coalesce((select r.access from public.team_roles r where r.company_id = p_company and r.role = p_role), '{}'::jsonb)
                 else '{}'::jsonb end;
$$;

-- Darf der angemeldete Nutzer in dieser Firma den Bereich lesen bzw. bearbeiten?
create or replace function public.nexora_may_in(p_company uuid, p_area text, p_level text default 'read')
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r text;
  a text;
begin
  -- ohne Anmeldung (Kunden-Links, Server-Funktionen, SQL-Editor) regeln die anderen Prüfungen alles
  if uid is null or p_company is null then return true; end if;
  r := public.nexora_member_role(p_company, uid);
  -- keine Rolle = nicht in dieser Firma; dann greifen die übrigen Regeln (user_id = Firma)
  if r is null or r in ('inhaber', 'mitgruender') then return true; end if;
  a := coalesce(public.nexora_role_access(p_company, r) ->> p_area, 'off');
  return case when p_level = 'write' then a = 'write' else a in ('read', 'write') end;
end;
$$;

-- … in der gerade offenen Firma (für die Regeln der geteilten Tabellen)
create or replace function public.nexora_may(p_area text, p_level text default 'read')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.nexora_may_in(public.nexora_workspace(), p_area, p_level);
$$;

-- Ist der angemeldete Nutzer Arbeitgeber (Inhaber oder Mitgründer) dieser Firma?
create or replace function public.nexora_is_employer(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.nexora_member_role(p_company, auth.uid()) in ('inhaber', 'mitgruender'), false);
$$;

revoke all on function public.nexora_role_default(text) from public, anon, authenticated;
revoke all on function public.nexora_member_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.nexora_role_access(uuid, text) from public, anon, authenticated;
revoke all on function public.nexora_may_in(uuid, text, text) from public, anon, authenticated;
revoke all on function public.nexora_may(text, text) from public, anon;
revoke all on function public.nexora_is_employer(uuid) from public, anon;
grant execute on function public.nexora_may(text, text) to authenticated;
grant execute on function public.nexora_is_employer(uuid) to authenticated;

-- Schreiben nur mit Recht „bearbeiten“ (gilt auch in Server-Funktionen wie issue_document).
-- Maßgeblich ist die Firma der Zeile (user_id bzw. company_id), nicht die gerade offene –
-- so kann z. B. ein Mitarbeiter trotzdem eine eigene Firma anlegen.
create or replace function public.nexora_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb;
begin
  if auth.uid() is null then return case when tg_op = 'DELETE' then old else new end; end if;
  j := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if not public.nexora_may_in(coalesce(j ->> 'company_id', j ->> 'user_id')::uuid, tg_argv[0], 'write') then
    raise exception 'role_forbidden:%', tg_argv[0] using errcode = 'PT403';
  end if;
  -- verschobene Zeile: auch für die alte Firma prüfen
  if tg_op = 'UPDATE' then
    j := to_jsonb(old);
    if not public.nexora_may_in(coalesce(j ->> 'company_id', j ->> 'user_id')::uuid, tg_argv[0], 'write') then
      raise exception 'role_forbidden:%', tg_argv[0] using errcode = 'PT403';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.nexora_guard_write() from public, anon, authenticated;

do $$
declare
  -- Tabelle -> Bereich
  map text[][] := array[
    ['customers', 'kunden'], ['customer_invites', 'kunden'],
    ['orders', 'auftraege'],
    ['appointments', 'termine'], ['calendar_feeds', 'termine'],
    ['todos', 'aufgaben'], ['goals', 'aufgaben'],
    ['documents', 'dokumente'], ['document_counters', 'dokumente'], ['invoice_followups', 'dokumente'],
    ['expenses', 'finanzen'],
    ['inventory_items', 'lager'],
    ['social_posts', 'social'], ['hashtag_sets', 'social'],
    ['business_settings', 'firma'], ['business_logos', 'firma']];
  i integer;
  t text;
  a text;
  r record;
begin
  for i in 1 .. array_length(map, 1) loop
    t := map[i][1];
    a := map[i][2];
    if to_regclass('public.' || t) is null then continue; end if;
    -- Schreiben: Trigger (klare Fehlermeldung statt stillem „nichts gespeichert“)
    execute format('drop trigger if exists nexora_guard_write on public.%I', t);
    execute format('create trigger nexora_guard_write before insert or update or delete on public.%I
                      for each row execute function public.nexora_guard_write(%L)', t, a);
    -- Lesen: Regel um das Recht ergänzen. Firma und Logo bleiben lesbar (PDFs, Wetter-Ort).
    if a = 'firma' then continue; end if;
    for r in select * from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT' loop
      if r.qual like '%nexora_may%' then continue; end if;
      execute format('alter policy %I on public.%I using ((%s) and (select public.nexora_may(%L, ''read'')))',
                     r.policyname, t, r.qual, a);
    end loop;
  end loop;

  -- Belege im Speicher gehören zu den Finanzen
  for r in select * from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'receipts_%' loop
    if coalesce(r.qual, '') || coalesce(r.with_check, '') like '%nexora_may%' then continue; end if;
    if r.cmd = 'SELECT' then
      execute format('alter policy %I on storage.objects using ((%s) and (select public.nexora_may(''finanzen'', ''read'')))', r.policyname, r.qual);
    elsif r.cmd = 'INSERT' then
      execute format('alter policy %I on storage.objects with check ((%s) and (select public.nexora_may(''finanzen'', ''write'')))', r.policyname, r.with_check);
    elsif r.cmd = 'UPDATE' then
      execute format('alter policy %I on storage.objects using ((%s) and (select public.nexora_may(''finanzen'', ''write''))) with check ((%s) and (select public.nexora_may(''finanzen'', ''write'')))',
                     r.policyname, r.qual, coalesce(r.with_check, r.qual));
    elsif r.cmd = 'DELETE' then
      execute format('alter policy %I on storage.objects using ((%s) and (select public.nexora_may(''finanzen'', ''write'')))', r.policyname, r.qual);
    end if;
  end loop;
end;
$$;

-- Luna nur mit Recht „Luna“ (Belege auslesen gehört zu den Finanzen und bleibt erlaubt)
create or replace function public.consume_quota(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.nexora_account();
  p text;
  lim integer;
  m text := public.nexora_month();
  n integer;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if p_kind not in ('nexy', 'receipt', 'voice') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  perform public.nexora_ensure_subscription(uid);
  p := public.nexora_plan(uid);
  lim := public.nexora_limit(p, p_kind);
  if p_kind in ('nexy', 'voice') and not public.nexora_may('luna', 'write') then
    return jsonb_build_object('allowed', false, 'forbidden', true, 'plan', p, 'limit', lim, 'used', 0);
  end if;
  insert into public.usage_counters as u (user_id, month, kind, used)
  values (uid, m, p_kind, 1)
  on conflict (user_id, month, kind) do update set used = u.used + 1 where u.used < lim
  returning u.used into n;
  if n is null then
    return jsonb_build_object('allowed', false, 'plan', p, 'limit', lim,
      'used', (select used from public.usage_counters where user_id = uid and month = m and kind = p_kind));
  end if;
  return jsonb_build_object('allowed', true, 'plan', p, 'limit', lim, 'used', n);
end;
$$;
revoke all on function public.consume_quota(text) from public, anon;
grant execute on function public.consume_quota(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Team verwalten (Inhaber und Mitgründer; Mitgründer ernennen nur der Inhaber)
-- ---------------------------------------------------------------------------
drop function if exists public.team_invite(text);
create or replace function public.team_invite(p_email text, p_role text default 'mitarbeiter')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws uuid := public.nexora_workspace();
  me text;
  acct uuid;
  v_role text := coalesce(nullif(trim(p_role), ''), 'mitarbeiter');
  used integer;
  new_code text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  me := public.nexora_member_role(ws, uid);
  if me is null or me not in ('inhaber', 'mitgruender') then
    raise exception 'team_member_cannot_invite' using errcode = 'PT403';
  end if;
  if v_role not in ('mitgruender', 'teamleitung', 'mitarbeiter') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if v_role = 'mitgruender' and me <> 'inhaber' then raise exception 'owner_only' using errcode = 'PT403'; end if;
  acct := (select c.owner_id from public.companies c where c.id = ws);
  -- Business und Teams (in der Testphase zum Ausprobieren ebenfalls)
  if public.nexora_plan(acct) not in ('business', 'teams', 'trial') then raise exception 'business_required' using errcode = 'PT402'; end if;
  perform 1 from public.subscriptions where user_id = acct for update;
  select 1 + (select count(distinct member_id) from public.team_members where owner_id = acct)
           + (select count(*) from public.team_invites where owner_id = acct and accepted_by is null)
    into used;
  if used >= public.nexora_seats(acct) then raise exception 'team_full' using errcode = 'PT409'; end if;
  loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.team_invites where code = new_code);
  end loop;
  insert into public.team_invites (code, owner_id, company_id, email, role)
  values (new_code, acct, ws, nullif(trim(p_email), ''), v_role);
  return new_code;
end;
$$;

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
  insert into public.team_members (member_id, owner_id, company_id, role) values (uid, inv.owner_id, inv.company_id, inv.role)
  on conflict (member_id, company_id) do nothing;
  update public.team_invites set accepted_by = uid, accepted_at = now() where code = inv.code;
  return jsonb_build_object('owner_id', inv.company_id, 'company_id', inv.company_id,
                            'owner_name', public.nexora_company_name(inv.company_id), 'role', inv.role);
end;
$$;

create or replace function public.team_remove(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.nexora_workspace();
  me text := public.nexora_member_role(ws, auth.uid());
  target text := (select m.role from public.team_members m where m.company_id = ws and m.member_id = p_member);
begin
  if me is null or me not in ('inhaber', 'mitgruender') then raise exception 'not_team_admin' using errcode = 'PT403'; end if;
  if target is null then return; end if;
  if target = 'mitgruender' and me <> 'inhaber' then raise exception 'owner_only' using errcode = 'PT403'; end if;
  delete from public.team_members where member_id = p_member and company_id = ws;
end;
$$;

create or replace function public.team_revoke(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.nexora_workspace();
begin
  if not public.nexora_is_employer(ws) then raise exception 'not_team_admin' using errcode = 'PT403'; end if;
  delete from public.team_invites where code = p_code and company_id = ws and accepted_by is null;
end;
$$;

-- Rolle, Bezeichnung (z. B. „Gärtner“) und Urlaubstage einer Person ändern.
-- null = unverändert, leere Bezeichnung = löschen.
create or replace function public.team_set_member(p_member uuid, p_role text default null, p_title text default null,
                                                  p_vacation_days numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.nexora_workspace();
  me text := public.nexora_member_role(ws, auth.uid());
  target text := (select m.role from public.team_members m where m.company_id = ws and m.member_id = p_member);
begin
  if me is null or me not in ('inhaber', 'mitgruender') then raise exception 'not_team_admin' using errcode = 'PT403'; end if;
  if target is null then raise exception 'member_not_found' using errcode = 'PT404'; end if;
  if p_role is not null and p_role not in ('mitgruender', 'teamleitung', 'mitarbeiter') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if me <> 'inhaber' and (target = 'mitgruender' or p_role = 'mitgruender') then
    raise exception 'owner_only' using errcode = 'PT403';
  end if;
  if p_vacation_days is not null and (p_vacation_days < 0 or p_vacation_days > 60) then
    raise exception 'invalid_vacation_days' using errcode = '22023';
  end if;
  update public.team_members
     set role = coalesce(p_role, role),
         title = case when p_title is null then title else left(nullif(trim(p_title), ''), 60) end,
         vacation_days = coalesce(p_vacation_days, vacation_days)
   where member_id = p_member and company_id = ws;
end;
$$;

-- Rechte einer Rolle (Teamleitung / Mitarbeiter) für die offene Firma speichern
create or replace function public.team_set_access(p_role text, p_access jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.nexora_workspace();
  clean jsonb := '{}'::jsonb;
  k text;
  v text;
begin
  if not public.nexora_is_employer(ws) then raise exception 'not_team_admin' using errcode = 'PT403'; end if;
  if p_role not in ('teamleitung', 'mitarbeiter') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if jsonb_typeof(p_access) <> 'object' then raise exception 'invalid_access' using errcode = '22023'; end if;
  for k, v in select key, value from jsonb_each_text(p_access) loop
    if k not in ('kunden', 'auftraege', 'termine', 'aufgaben', 'dokumente', 'finanzen', 'lager', 'social', 'firma',
                 'luna', 'fahrplan', 'personal') then continue; end if;
    if v not in ('off', 'read', 'write') then continue; end if;
    -- Ein/Aus-Bereiche kennen kein „ansehen“
    if k in ('luna', 'fahrplan', 'personal') and v = 'read' then v := 'write'; end if;
    clean := clean || jsonb_build_object(k, v);
  end loop;
  insert into public.team_roles as r (company_id, role, access) values (ws, p_role, clean)
  on conflict (company_id, role) do update set access = r.access || excluded.access, updated_at = now();
  return public.nexora_role_access(ws, p_role);
end;
$$;

-- Übersicht der offenen Firma – wie bisher, dazu Rollen, Rechte und Plätze
create or replace function public.my_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws uuid;
  owner uuid;
  me text;
  boss boolean;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  ws := public.nexora_workspace();
  owner := coalesce((select c.owner_id from public.companies c where c.id = ws), ws);
  me := coalesce(public.nexora_member_role(ws, uid), 'inhaber');
  boss := me in ('inhaber', 'mitgruender');
  return jsonb_build_object(
    'role', case when owner <> uid then 'member'
                 when exists (select 1 from public.team_members where company_id = ws) then 'owner'
                 else 'solo' end,
    'my_role', me,
    'owner_id', ws,
    'company_id', ws,
    'owner_name', public.nexora_company_name(ws),
    'plan', public.nexora_plan(owner),
    'seats', public.nexora_seats(owner),
    -- Plätze fürs ganze Konto (alle Firmen) inkl. offener Einladungen
    'seats_used', 1 + (select count(distinct member_id) from public.team_members where owner_id = owner)
                    + (select count(*) from public.team_invites where owner_id = owner and accepted_by is null),
    'access', case when boss then null else public.nexora_role_access(ws, me) end,
    'roles', jsonb_build_object(
      'teamleitung', public.nexora_role_access(ws, 'teamleitung'),
      'mitarbeiter', public.nexora_role_access(ws, 'mitarbeiter')),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', coalesce(p.display_name, split_part(u.email, '@', 1)),
        'email', u.email,
        'owner', u.id = owner,
        'role', case when u.id = owner then 'inhaber' else m.role end,
        'title', m.title,
        'vacation_days', case when u.id = owner then null else m.vacation_days end,
        'joined_at', m.joined_at) order by (u.id = owner) desc, m.joined_at)
      from auth.users u
      left join public.team_members m on m.member_id = u.id and m.company_id = ws
      left join public.profiles p on p.id = u.id
      where u.id = owner or m.company_id = ws), '[]'::jsonb),
    'invites', case when boss then coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'email', email, 'role', role, 'created_at', created_at) order by created_at)
      from public.team_invites where company_id = ws and accepted_by is null), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.team_invite(text, text) from public, anon;
revoke all on function public.team_join(text) from public, anon;
revoke all on function public.team_remove(uuid) from public, anon;
revoke all on function public.team_revoke(text) from public, anon;
revoke all on function public.team_set_member(uuid, text, text, numeric) from public, anon;
revoke all on function public.team_set_access(text, jsonb) from public, anon;
revoke all on function public.my_team() from public, anon;
grant execute on function public.team_invite(text, text) to authenticated;
grant execute on function public.team_join(text) to authenticated;
grant execute on function public.team_remove(uuid) to authenticated;
grant execute on function public.team_revoke(text) to authenticated;
grant execute on function public.team_set_member(uuid, text, text, numeric) to authenticated;
grant execute on function public.team_set_access(text, jsonb) to authenticated;
grant execute on function public.my_team() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Team-Chats: „leitung“ (nur Arbeitgeber), „alle“, „direkt“ (zwei Personen)
-- ---------------------------------------------------------------------------
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.nexora_workspace() references public.companies (id) on delete cascade,
  channel text not null check (channel in ('alle', 'leitung', 'direkt')),
  recipient_id uuid references auth.users (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint team_messages_recipient_check check ((channel = 'direkt') = (recipient_id is not null))
);
create index if not exists team_messages_company_idx on public.team_messages (company_id, created_at desc);
create index if not exists team_messages_direct_idx on public.team_messages (company_id, sender_id, recipient_id);
alter table public.team_messages enable row level security;
revoke all on public.team_messages from anon, authenticated;
grant select, insert, delete on public.team_messages to authenticated;

-- Darf der angemeldete Nutzer diese Nachricht sehen bzw. schreiben?
-- (eigene Funktion, weil die Regeln auch im Live-Chat ohne Firmen-Header gelten müssen)
create or replace function public.nexora_chat_visible(p_company uuid, p_channel text, p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and public.nexora_member_role(p_company, auth.uid()) is not null
     and (p_channel = 'alle'
          or (p_channel = 'leitung' and public.nexora_member_role(p_company, auth.uid()) in ('inhaber', 'mitgruender'))
          or (p_channel = 'direkt' and auth.uid() in (p_sender, p_recipient)));
$$;

create or replace function public.nexora_chat_can_send(p_company uuid, p_channel text, p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_sender = auth.uid()
     and public.nexora_team_plan(p_company)
     and public.nexora_chat_visible(p_company, p_channel, p_sender, p_recipient)
     and (p_channel <> 'direkt'
          or (p_recipient <> p_sender and public.nexora_member_role(p_company, p_recipient) is not null));
$$;
revoke all on function public.nexora_chat_visible(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.nexora_chat_can_send(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.nexora_chat_visible(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.nexora_chat_can_send(uuid, text, uuid, uuid) to authenticated;

drop policy if exists "team_messages_select" on public.team_messages;
create policy "team_messages_select" on public.team_messages
  for select to authenticated
  using (public.nexora_chat_visible(company_id, channel, sender_id, recipient_id));
drop policy if exists "team_messages_insert" on public.team_messages;
create policy "team_messages_insert" on public.team_messages
  for insert to authenticated
  with check (public.nexora_chat_can_send(company_id, channel, sender_id, recipient_id));
drop policy if exists "team_messages_delete" on public.team_messages;
create policy "team_messages_delete" on public.team_messages
  for delete to authenticated
  using (sender_id = (select auth.uid()));

-- Live-Chat (Supabase Realtime), sofern vorhanden
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_messages') then
    alter publication supabase_realtime add table public.team_messages;
  end if;
end;
$$;

-- Bis wann jemand einen Chat gelesen hat (chat = 'alle', 'leitung' oder 'direkt:<Person>')
create table if not exists public.team_chat_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  chat text not null check (chat ~ '^(alle|leitung|direkt:[0-9a-f-]{36})$'),
  read_at timestamptz not null default now(),
  primary key (user_id, company_id, chat)
);
alter table public.team_chat_reads enable row level security;
revoke all on public.team_chat_reads from anon, authenticated;

-- Chats der offenen Firma: letzte Nachricht und Zahl der ungelesenen
create or replace function public.team_chats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws uuid := public.nexora_workspace();
  me text;
  res jsonb;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  me := public.nexora_member_role(ws, uid);
  if me is null then return '[]'::jsonb; end if;
  with msgs as (
    select m.body, m.sender_id, m.created_at,
           case when m.channel = 'direkt'
                then 'direkt:' || (case when m.sender_id = uid then m.recipient_id else m.sender_id end)::text
                else m.channel end as chat
      from public.team_messages m
     where m.company_id = ws
       and (m.channel = 'alle'
            or (m.channel = 'leitung' and me in ('inhaber', 'mitgruender'))
            or (m.channel = 'direkt' and uid in (m.sender_id, m.recipient_id)))
  ), last as (
    select distinct on (chat) chat, body, sender_id, created_at from msgs order by chat, created_at desc
  ), unread as (
    select x.chat, count(*) as n
      from msgs x
      left join public.team_chat_reads r on r.user_id = uid and r.company_id = ws and r.chat = x.chat
     where x.sender_id <> uid and (r.read_at is null or x.created_at > r.read_at)
     group by x.chat
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'chat', l.chat, 'body', left(l.body, 140), 'sender_id', l.sender_id, 'at', l.created_at,
           'unread', coalesce(u.n, 0))), '[]'::jsonb)
    into res
    from last l left join unread u on u.chat = l.chat;
  return res;
end;
$$;

create or replace function public.team_chat_read(p_chat text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.nexora_workspace();
begin
  if auth.uid() is null or public.nexora_member_role(ws, auth.uid()) is null then return; end if;
  if p_chat !~ '^(alle|leitung|direkt:[0-9a-f-]{36})$' then raise exception 'invalid_chat' using errcode = '22023'; end if;
  insert into public.team_chat_reads as r (user_id, company_id, chat, read_at) values (auth.uid(), ws, p_chat, now())
  on conflict (user_id, company_id, chat) do update set read_at = now();
end;
$$;

revoke all on function public.team_chats() from public, anon;
revoke all on function public.team_chat_read(text) from public, anon;
grant execute on function public.team_chats() to authenticated;
grant execute on function public.team_chat_read(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Arbeitsplan: Schichten je Person und Tag (alle im Team sehen den Plan,
--    eintragen darf, wer „Personal“ hat)
-- ---------------------------------------------------------------------------
create or replace function public.nexora_in_company(p_company uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.nexora_member_role(p_company, p_user) is not null;
$$;
revoke all on function public.nexora_in_company(uuid, uuid) from public, anon;
grant execute on function public.nexora_in_company(uuid, uuid) to authenticated;

create or replace function public.nexora_team_plan_ok(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.nexora_team_plan(p_company);
$$;
revoke all on function public.nexora_team_plan_ok(uuid) from public, anon;
grant execute on function public.nexora_team_plan_ok(uuid) to authenticated;

create table if not exists public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.nexora_workspace() references public.companies (id) on delete cascade,
  member_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  starts_at time not null,
  ends_at time not null,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- endet die Schicht vor dem Beginn, geht sie über Mitternacht
  check (ends_at <> starts_at)
);
create index if not exists work_shifts_company_day_idx on public.work_shifts (company_id, day);
alter table public.work_shifts enable row level security;
revoke all on public.work_shifts from anon, authenticated;
grant select, insert, update, delete on public.work_shifts to authenticated;

drop policy if exists "work_shifts_select" on public.work_shifts;
create policy "work_shifts_select" on public.work_shifts
  for select to authenticated using (company_id = (select public.nexora_workspace()));
drop policy if exists "work_shifts_insert" on public.work_shifts;
create policy "work_shifts_insert" on public.work_shifts
  for insert to authenticated
  with check (company_id = (select public.nexora_workspace())
              and public.nexora_in_company(company_id, member_id)
              and (select public.nexora_team_plan_ok(company_id)));
drop policy if exists "work_shifts_update" on public.work_shifts;
create policy "work_shifts_update" on public.work_shifts
  for update to authenticated
  using (company_id = (select public.nexora_workspace()))
  with check (company_id = (select public.nexora_workspace()) and public.nexora_in_company(company_id, member_id));
drop policy if exists "work_shifts_delete" on public.work_shifts;
create policy "work_shifts_delete" on public.work_shifts
  for delete to authenticated using (company_id = (select public.nexora_workspace()));

drop trigger if exists nexora_guard_write on public.work_shifts;
create trigger nexora_guard_write before insert or update or delete on public.work_shifts
  for each row execute function public.nexora_guard_write('personal');
drop trigger if exists work_shifts_updated_at on public.work_shifts;
create trigger work_shifts_updated_at before update on public.work_shifts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Abwesenheiten: Urlaub (beantragen → genehmigen), krank (melden), frei
-- ---------------------------------------------------------------------------
create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.nexora_workspace() references public.companies (id) on delete cascade,
  member_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('urlaub', 'krank', 'frei')),
  starts_on date not null,
  ends_on date not null,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'offen' check (status in ('offen', 'genehmigt', 'abgelehnt', 'gemeldet')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index if not exists absences_company_idx on public.absences (company_id, starts_on);
alter table public.absences enable row level security;
revoke all on public.absences from anon, authenticated;
grant select, insert, delete on public.absences to authenticated;

-- Eigene Anträge sieht jeder, alle Anträge nur wer Personal verwaltet
drop policy if exists "absences_select" on public.absences;
create policy "absences_select" on public.absences
  for select to authenticated
  using (company_id = (select public.nexora_workspace())
         and (member_id = (select auth.uid()) or (select public.nexora_may('personal', 'write'))));
drop policy if exists "absences_insert" on public.absences;
create policy "absences_insert" on public.absences
  for insert to authenticated
  with check (company_id = (select public.nexora_workspace())
              and (select public.nexora_team_plan_ok(company_id))
              and public.nexora_in_company(company_id, member_id)
              and (member_id = (select auth.uid()) or (select public.nexora_may('personal', 'write'))));
-- Zurückziehen: eigene offene Anträge bzw. Krankmeldungen; Personal darf alles löschen
drop policy if exists "absences_delete" on public.absences;
create policy "absences_delete" on public.absences
  for delete to authenticated
  using (company_id = (select public.nexora_workspace())
         and ((member_id = (select auth.uid()) and status in ('offen', 'gemeldet'))
              or (select public.nexora_may('personal', 'write'))));

-- Status setzt immer die Datenbank: krank = gemeldet, von Personal eingetragen = genehmigt, sonst offen
create or replace function public.nexora_absence_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.decided_by := null;
  new.decided_at := null;
  new.decision_note := null;
  if new.kind = 'krank' then
    new.status := 'gemeldet';
  elsif public.nexora_may('personal', 'write') and auth.uid() is not null then
    new.status := 'genehmigt';
    new.decided_by := auth.uid();
    new.decided_at := now();
  else
    new.status := 'offen';
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_absence_status() from public, anon, authenticated;
drop trigger if exists absences_status on public.absences;
create trigger absences_status before insert on public.absences
  for each row execute function public.nexora_absence_status();

-- Antrag genehmigen oder ablehnen (wer Personal verwaltet)
create or replace function public.absence_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.nexora_workspace();
  a public.absences;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if not public.nexora_may('personal', 'write') then raise exception 'role_forbidden:personal' using errcode = 'PT403'; end if;
  select * into a from public.absences where id = p_id and company_id = ws for update;
  if not found then raise exception 'absence_not_found' using errcode = 'PT404'; end if;
  if a.kind = 'krank' then raise exception 'absence_is_sick_note' using errcode = '22023'; end if;
  update public.absences
     set status = case when p_approve then 'genehmigt' else 'abgelehnt' end,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = left(nullif(trim(p_note), ''), 300)
   where id = p_id;
end;
$$;

-- Wer ist wann abwesend? Für den Arbeitsplan – ohne Grund, außer bei einem selbst bzw. für Personal.
create or replace function public.team_absences(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws uuid := public.nexora_workspace();
  hr boolean := public.nexora_may('personal', 'write');
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if public.nexora_member_role(ws, uid) is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id,
             'member_id', a.member_id,
             'starts_on', a.starts_on,
             'ends_on', a.ends_on,
             'kind', case when hr or a.member_id = uid then a.kind else 'abwesend' end,
             'status', a.status) order by a.starts_on)
      from public.absences a
     where a.company_id = ws
       and a.status in ('genehmigt', 'gemeldet')
       and a.starts_on <= p_to and a.ends_on >= p_from), '[]'::jsonb);
end;
$$;

revoke all on function public.absence_decide(uuid, boolean, text) from public, anon;
revoke all on function public.team_absences(date, date) from public, anon;
grant execute on function public.absence_decide(uuid, boolean, text) to authenticated;
grant execute on function public.team_absences(date, date) to authenticated;

notify pgrst, 'reload schema';

commit;
