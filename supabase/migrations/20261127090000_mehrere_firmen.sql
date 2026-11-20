-- Mehrere Firmen in einem Konto
-- Voraussetzung: alle bisherigen Skripte (bis 20261126090000_team_antworten.sql).
--
-- Bisher galt: ein Konto = eine Firma (die Firmendaten hingen an der Konto-ID). Jetzt kann ein
-- Konto weitere Firmen anlegen – jede mit eigenen Kunden, Aufträgen, Rechnungen, Finanzen,
-- Terminen usw. und mit eigenem Team. Preis: 9,99 € im Monat je weiterer Firma (Pro und
-- Business). Luna-Kontingent, Abo und Personen (Business: 5) gelten fürs ganze Konto.
--
-- So funktioniert es:
--   * Tabelle companies: die erste Firma jedes Kontos hat dieselbe ID wie das Konto – alle
--     bisherigen Daten gehören damit automatisch zur ersten Firma, nichts wird verschoben.
--   * Die App schickt bei jeder Anfrage mit, welche Firma gerade offen ist (Header
--     x-lunaxora-company). nexora_workspace() prüft, ob man zu dieser Firma gehört – sonst gilt
--     wie bisher die eigene Firma bzw. das Team, dem man beigetreten ist. Jedes Gerät kann so
--     eine andere Firma offen haben.
--   * Abo und Kontingent rechnen über nexora_account() immer mit dem Konto des Inhabers.
--   * subscriptions.extra_companies = wie viele weitere Firmen gebucht sind (Admin-Abos: frei).
--
-- Läuft als eine Transaktion: Klappt etwas nicht, bleibt alles wie vorher.

begin;

-- ---------------------------------------------------------------------------
-- 1. Firmen
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text check (name is null or char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create index if not exists companies_owner_idx on public.companies (owner_id);
alter table public.companies enable row level security;
revoke all on public.companies from anon, authenticated;

-- erste Firma jedes Kontos (ID = Konto-ID)
insert into public.companies (id, owner_id)
select id, id from auth.users
on conflict (id) do nothing;

-- gebuchte weitere Firmen
alter table public.subscriptions add column if not exists extra_companies integer not null default 0;
alter table public.subscriptions drop constraint if exists subscriptions_extra_companies_check;
alter table public.subscriptions add constraint subscriptions_extra_companies_check check (extra_companies between 0 and 50);

-- neue Konten: Profil + erste Firma
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  insert into public.companies (id, owner_id)
  values (new.id, new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Team je Firma (eine Person kann in mehreren Firmen sein)
-- ---------------------------------------------------------------------------
alter table public.team_members add column if not exists company_id uuid;
update public.team_members set company_id = owner_id where company_id is null;
alter table public.team_members alter column company_id set not null;
alter table public.team_members drop constraint if exists team_members_company_id_fkey;
alter table public.team_members add constraint team_members_company_id_fkey
  foreign key (company_id) references public.companies (id) on delete cascade;
alter table public.team_members drop constraint if exists team_members_pkey;
alter table public.team_members add primary key (member_id, company_id);
create index if not exists team_members_company_idx on public.team_members (company_id);

alter table public.team_invites add column if not exists company_id uuid;
update public.team_invites set company_id = owner_id where company_id is null;
alter table public.team_invites alter column company_id set not null;
alter table public.team_invites drop constraint if exists team_invites_company_id_fkey;
alter table public.team_invites add constraint team_invites_company_id_fkey
  foreign key (company_id) references public.companies (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 3. Welche Firma ist gerade offen?
-- ---------------------------------------------------------------------------

-- Gehört der angemeldete Nutzer zu dieser Firma (Inhaber oder Teammitglied)?
create or replace function public.nexora_can_access(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.companies c where c.id = p_company and c.owner_id = auth.uid())
    or exists (select 1 from public.team_members m where m.company_id = p_company and m.member_id = auth.uid()));
$$;

-- Ohne Auswahl: das Team, dem man beigetreten ist, sonst die eigene erste Firma (wie bisher)
create or replace function public.nexora_default_company(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.company_id from public.team_members m where m.member_id = p_user order by m.joined_at, m.company_id limit 1),
    p_user);
$$;

create or replace function public.nexora_workspace()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  h text;
begin
  if uid is null then return null; end if;
  begin
    h := nullif(current_setting('request.headers', true), '')::json ->> 'x-lunaxora-company';
  exception when others then
    h := null;
  end;
  if h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and public.nexora_can_access(h::uuid) then
    return h::uuid;
  end if;
  return public.nexora_default_company(uid);
end;
$$;
revoke all on function public.nexora_workspace() from public, anon;
grant execute on function public.nexora_workspace() to authenticated;

-- Konto, über das Abo und Kontingent laufen (Inhaber der offenen Firma)
create or replace function public.nexora_account()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select c.owner_id from public.companies c where c.id = public.nexora_workspace()), auth.uid());
$$;

-- Name einer Firma (erste Firma: wie bisher aus dem Profil)
create or replace function public.nexora_company_name(p_company uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when c.id = c.owner_id
              then coalesce(nullif(p.business_name, ''), nullif(b.company_name, ''), p.display_name)
              else coalesce(nullif(b.company_name, ''), c.name) end
  from public.companies c
  left join public.profiles p on p.id = c.owner_id
  left join public.business_settings b on b.user_id = c.id
  where c.id = p_company;
$$;

-- Belege im Speicher: Ordner = Firma, auf die man Zugriff hat
create or replace function public.nexora_can_access_folder(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f text := split_part(p_name, '/', 1);
begin
  if f !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.nexora_can_access(f::uuid);
end;
$$;

revoke all on function public.nexora_can_access(uuid) from public, anon, authenticated;
revoke all on function public.nexora_default_company(uuid) from public, anon, authenticated;
revoke all on function public.nexora_account() from public, anon, authenticated;
revoke all on function public.nexora_company_name(uuid) from public, anon, authenticated;
revoke all on function public.nexora_can_access_folder(text) from public, anon;
grant execute on function public.nexora_can_access_folder(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Firmendaten gehören zur Firma, nicht mehr direkt zum Konto
--    (Fremdschlüssel user_id -> companies; Konto löschen löscht weiterhin alles mit)
-- ---------------------------------------------------------------------------
do $$
declare
  shared text[] := array[
    'customers', 'orders', 'documents', 'document_counters', 'business_settings', 'business_logos',
    'appointments', 'calendar_feeds', 'expenses', 'invoice_followups', 'email_log', 'todos', 'goals',
    'social_posts', 'hashtag_sets', 'customer_invites', 'inventory_items'];
  t text;
  r record;
begin
  foreach t in array shared loop
    if to_regclass('public.' || t) is null then continue; end if;
    for r in
      select c.conname
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.conrelid = ('public.' || t)::regclass and c.contype = 'f'
         and c.confrelid = 'auth.users'::regclass and a.attname = 'user_id'
    loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);
    end loop;
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t)::regclass and conname = t || '_company_fkey') then
      execute format('alter table public.%I add constraint %I foreign key (user_id) references public.companies (id) on delete cascade',
                     t, t || '_company_fkey');
    end if;
  end loop;
end;
$$;

-- Belege im Speicher
drop policy if exists "receipts_select_own" on storage.objects;
create policy "receipts_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.nexora_can_access_folder(name));
drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.nexora_can_access_folder(name));
drop policy if exists "receipts_update_own" on storage.objects;
create policy "receipts_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and public.nexora_can_access_folder(name))
  with check (bucket_id = 'receipts' and public.nexora_can_access_folder(name));
drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.nexora_can_access_folder(name));

-- ---------------------------------------------------------------------------
-- 5. Abo und Kontingent: immer das Konto des Inhabers
-- ---------------------------------------------------------------------------
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
    return case when s.tier = 'business' then 'business' else 'pro' end;
  end if;
  if s.status = 'trial' and s.trial_ends_at is not null and s.trial_ends_at > now() then return 'trial'; end if;
  return 'free';
end;
$$;
revoke all on function public.nexora_plan(uuid) from public, anon, authenticated;

create or replace function public.my_plan()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.nexora_account();
  p text;
  s public.subscriptions;
  m text := public.nexora_month();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  perform public.nexora_ensure_subscription(uid);
  p := public.nexora_plan(uid);
  select * into s from public.subscriptions where user_id = uid;
  return jsonb_build_object(
    'plan', p,
    'status', s.status,
    'trial_ends_at', s.trial_ends_at,
    'current_period_end', s.current_period_end,
    'month', m,
    'usage', (
      select jsonb_object_agg(k, jsonb_build_object(
        'used', coalesce((select used from public.usage_counters where user_id = uid and month = m and kind = k), 0),
        'limit', public.nexora_limit(p, k)))
      from unnest(array['nexy', 'receipt', 'voice']) as k
    )
  );
end;
$$;

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

create or replace function public.refund_quota(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.nexora_account();
begin
  if uid is null then return; end if;
  update public.usage_counters set used = used - 1
  where user_id = uid and month = public.nexora_month() and kind = p_kind and used > 0;
end;
$$;

create or replace function public.nexora_require_pro()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.nexora_account();
begin
  if uid is null then return; end if; -- z. B. Admin im SQL-Editor
  perform public.nexora_ensure_subscription(uid);
  if public.nexora_plan(uid) = 'free' then
    raise exception 'pro_required' using errcode = 'PT402';
  end if;
end;
$$;

revoke all on function public.my_plan() from public, anon;
revoke all on function public.consume_quota(text) from public, anon;
revoke all on function public.refund_quota(text) from public, anon;
revoke all on function public.nexora_require_pro() from public, anon, authenticated;
grant execute on function public.my_plan() to authenticated;
grant execute on function public.consume_quota(text) to authenticated;
grant execute on function public.refund_quota(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Firmen anlegen und auflisten
-- ---------------------------------------------------------------------------

-- Wie viele weitere Firmen darf das Konto haben?
create or replace function public.nexora_extra_allowed(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case when s.source = 'admin' then 50
                when public.nexora_plan(p_user) in ('pro', 'business') then s.extra_companies
                else 0 end
      from public.subscriptions s where s.user_id = p_user), 0);
$$;
revoke all on function public.nexora_extra_allowed(uuid) from public, anon, authenticated;

-- Alle Firmen, zu denen man gehört (eigene und die von Teams). Die eigene erste Firma
-- bleibt für reine Teammitglieder verborgen (wie bisher: sie arbeiten in der Firma des Teams) –
-- außer man hat dort selbst ein Team oder weitere eigene Firmen.
create or replace function public.my_companies()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  return jsonb_build_object(
    'default_id', public.nexora_default_company(uid),
    'extra_allowed', public.nexora_extra_allowed(uid),
    'extra_used', (select count(*) from public.companies where owner_id = uid and id <> uid),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'name', public.nexora_company_name(c.id),
               'primary', c.id = c.owner_id,
               'role', case when c.owner_id = uid then 'owner' else 'member' end)
             order by (c.owner_id = uid) desc, (c.id = c.owner_id) desc, c.created_at)
        from public.companies c
       where (c.owner_id = uid
              and (c.id <> uid
                   or not exists (select 1 from public.team_members m where m.member_id = uid)
                   or exists (select 1 from public.team_members m where m.company_id = uid)
                   or exists (select 1 from public.companies x where x.owner_id = uid and x.id <> uid)))
          or exists (select 1 from public.team_members m where m.company_id = c.id and m.member_id = uid)), '[]'::jsonb)
  );
end;
$$;

-- Weitere Firma anlegen (9,99 € im Monat; muss gebucht sein – Admin-Abos frei)
create or replace function public.company_create(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  used integer;
  new_id uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if v_name is null or char_length(v_name) > 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  perform public.nexora_ensure_subscription(uid);
  -- gleichzeitiges Anlegen nacheinander abarbeiten
  perform 1 from public.subscriptions where user_id = uid for update;
  select count(*) into used from public.companies where owner_id = uid and id <> uid;
  if used >= public.nexora_extra_allowed(uid) then
    raise exception 'company_limit' using errcode = 'PT402';
  end if;
  insert into public.companies (owner_id, name) values (uid, v_name) returning id into new_id;
  insert into public.business_settings (user_id, company_name) values (new_id, left(v_name, 160))
  on conflict (user_id) do nothing;
  return new_id;
end;
$$;

revoke all on function public.my_companies() from public, anon;
revoke all on function public.company_create(text) from public, anon;
grant execute on function public.my_companies() to authenticated;
grant execute on function public.company_create(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Team-Funktionen je Firma
-- ---------------------------------------------------------------------------

-- Inhaber lädt in die gerade offene Firma ein. Personen zählen fürs ganze Konto (max. 5).
create or replace function public.team_invite(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws uuid := public.nexora_workspace();
  used integer;
  new_code text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if not exists (select 1 from public.companies where id = ws and owner_id = uid) then
    raise exception 'team_member_cannot_invite' using errcode = 'PT403';
  end if;
  -- Business (in der Testphase zum Ausprobieren ebenfalls)
  if public.nexora_plan(uid) not in ('business', 'trial') then raise exception 'business_required' using errcode = 'PT402'; end if;
  select 1 + (select count(distinct member_id) from public.team_members where owner_id = uid)
           + (select count(*) from public.team_invites where owner_id = uid and accepted_by is null)
    into used;
  if used >= 5 then raise exception 'team_full' using errcode = 'PT409'; end if;
  loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.team_invites where code = new_code);
  end loop;
  insert into public.team_invites (code, owner_id, company_id, email) values (new_code, uid, ws, nullif(trim(p_email), ''));
  return new_code;
end;
$$;

-- Mit Code der Firma beitreten, für die der Code erstellt wurde
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
  insert into public.team_members (member_id, owner_id, company_id) values (uid, inv.owner_id, inv.company_id)
  on conflict (member_id, company_id) do nothing;
  update public.team_invites set accepted_by = uid, accepted_at = now() where code = inv.code;
  return jsonb_build_object('owner_id', inv.company_id, 'company_id', inv.company_id,
                            'owner_name', public.nexora_company_name(inv.company_id));
end;
$$;

-- Die gerade offene Firma verlassen (Mitglied)
create or replace function public.team_leave()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.team_members where member_id = auth.uid() and company_id = public.nexora_workspace();
$$;

-- Jemanden aus der gerade offenen Firma entfernen (Inhaber)
create or replace function public.team_remove(p_member uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.team_members
   where member_id = p_member and owner_id = auth.uid() and company_id = public.nexora_workspace();
$$;

-- Übersicht der gerade offenen Firma: Rolle, Inhaber, Mitglieder, offene Einladungen
-- (owner_id = ID der Firma, unter der ihre Daten gespeichert sind – so lesen es auch ältere App-Versionen)
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
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  ws := public.nexora_workspace();
  owner := coalesce((select c.owner_id from public.companies c where c.id = ws), ws);
  return jsonb_build_object(
    'role', case when owner <> uid then 'member'
                 when exists (select 1 from public.team_members where company_id = ws) then 'owner'
                 else 'solo' end,
    'owner_id', ws,
    'company_id', ws,
    'owner_name', public.nexora_company_name(ws),
    'seats', 5,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', coalesce(p.display_name, split_part(u.email, '@', 1)),
        'email', u.email,
        'owner', u.id = owner,
        'joined_at', m.joined_at) order by (u.id = owner) desc, m.joined_at)
      from auth.users u
      left join public.team_members m on m.member_id = u.id and m.company_id = ws
      left join public.profiles p on p.id = u.id
      where u.id = owner or m.company_id = ws), '[]'::jsonb),
    'invites', case when owner = uid then coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'email', email, 'created_at', created_at) order by created_at)
      from public.team_invites where company_id = ws and accepted_by is null), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- Antworten des Inhabers für neue Teammitglieder (Firmenname = Name der Firma)
create or replace function public.team_answers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when c.owner_id is distinct from auth.uid() then jsonb_build_object(
      'business_name', public.nexora_company_name(c.id),
      'stage', p.stage,
      'industry', p.industry,
      'industry_other', p.industry_other,
      'legal_form', p.legal_form,
      'goals', p.goals) end
  from public.companies c
  join public.profiles p on p.id = c.owner_id
  where c.id = public.nexora_workspace();
$$;

revoke all on function public.team_invite(text) from public, anon;
revoke all on function public.team_join(text) from public, anon;
revoke all on function public.team_leave() from public, anon;
revoke all on function public.team_remove(uuid) from public, anon;
revoke all on function public.my_team() from public, anon;
revoke all on function public.team_answers() from public, anon;
grant execute on function public.team_invite(text) to authenticated;
grant execute on function public.team_join(text) to authenticated;
grant execute on function public.team_leave() to authenticated;
grant execute on function public.team_remove(uuid) to authenticated;
grant execute on function public.my_team() to authenticated;
grant execute on function public.team_answers() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Mitteilung bei Antwort auf ein Angebot: Inhaber und Team DIESER Firma
-- ---------------------------------------------------------------------------
create or replace function public.nexora_offer_reply_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_accepted boolean := new.accepted_at is not null and old.accepted_at is null;
  v_declined boolean := new.declined_at is not null and old.declined_at is null;
  v_tokens jsonb;
begin
  if new.kind <> 'offer' or not (v_accepted or v_declined) then return new; end if;

  select jsonb_agg(t.token) into v_tokens
    from public.push_tokens t
   where t.user_id = (select c.owner_id from public.companies c where c.id = new.user_id)
      or t.user_id in (select m.member_id from public.team_members m where m.company_id = new.user_id);
  if v_tokens is null then return new; end if;

  -- Fehler beim Verschicken dürfen das Annehmen durch den Kunden nie aufhalten
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_object(
        'to', v_tokens,
        'title', 'Angebot ' || new.number || case when v_accepted then ' angenommen' else ' abgelehnt' end,
        'body', case when v_accepted
                     then 'Dein Kunde hat das Angebot online angenommen. Tippe, um es anzusehen.'
                     else 'Dein Kunde hat das Angebot abgelehnt. Mehr dazu in Lunaxora.' end,
        'sound', 'default',
        'data', jsonb_build_object('kind', 'offers', 'document_id', new.id, 'order_id', new.order_id)
      ),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'push failed: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.nexora_offer_reply_push() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Kosten-Übersicht: Person in mehreren Teams -> erstes Team zählt
-- ---------------------------------------------------------------------------
create or replace function kosten.inhaber(p_user uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  return coalesce(
    (select t.owner_id from public.team_members t where t.member_id = p_user order by t.joined_at limit 1),
    p_user);
exception when undefined_table then
  return p_user;
end;
$$;

notify pgrst, 'reload schema';

commit;
