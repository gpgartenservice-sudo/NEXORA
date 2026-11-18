-- Lunaxora Business: bis zu 3 Personen statt 5 (Preis ab 18.11.2026: 44,99 € im Monat bzw. 449,90 € im Jahr)
--
-- Einmalig im Supabase-Dashboard ausführen (SQL Editor -> New query -> alles einfügen -> Run),
-- NACH 20261120090000_feinschliff.sql (und nach 20261121090000_kostendeckel.sql, falls vorhanden).
-- Zweimal ausführen schadet nicht.
--
-- Was sich ändert:
--  1. team_invite: höchstens 3 Personen im Team (Inhaber + Mitglieder + offene Einladungen).
--     Bestehende größere Teams bleiben bestehen; es können nur keine weiteren eingeladen werden.
--  2. my_team: meldet seats = 3 an die App.
--  3. nexora_limit: Business-Kontingent fürs ganze Team = 3 × Pro
--     (300 Luna-Nachrichten, 150 Belege, 360 Vorlese-Antworten, 900 Minuten-Einheiten Spracherkennung).
--     Pro, Testphase und Gratis bleiben unverändert. Die Zeile 'transcribe' passt zu
--     20261121090000_kostendeckel.sql und schadet ohne dieses Skript nicht.
--
-- Wird 20261121090000_kostendeckel.sql erst NACH diesem Skript ausgeführt, setzt es die alten
-- Business-Grenzen (500/250/1500/600) zurück – dann dieses Skript danach noch einmal ausführen.
-- Den Preis selbst legt Stripe fest (Lookup-Keys business_month / business_year, supabase/README.md).

-- ---------------------------------------------------------------------------
-- 1. Einladen: höchstens 3 Personen
-- ---------------------------------------------------------------------------
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
  if used >= 3 then raise exception 'team_full' using errcode = 'PT409'; end if;
  loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.team_invites where code = new_code);
  end loop;
  insert into public.team_invites (code, owner_id, email) values (new_code, uid, nullif(trim(p_email), ''));
  return new_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Übersicht für die App: seats = 3
-- ---------------------------------------------------------------------------
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
    'seats', 3,
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

-- ---------------------------------------------------------------------------
-- 3. Kontingente: Business fürs ganze Team = 3 × Pro
-- ---------------------------------------------------------------------------
create or replace function public.nexora_limit(p_plan text, p_kind text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'business' then case p_kind when 'nexy' then 300 when 'receipt' then 150 when 'transcribe' then 900 else 360 end
    when 'pro'      then case p_kind when 'nexy' then 100 when 'receipt' then 50  when 'transcribe' then 300 else 120 end
    when 'trial'    then case p_kind when 'nexy' then 50  when 'receipt' then 20  when 'transcribe' then 150 else 70  end
    else                 case p_kind when 'nexy' then 15  when 'receipt' then 3   when 'transcribe' then 45  else 30  end
  end;
$$;

revoke all on function public.team_invite(text) from public, anon;
revoke all on function public.my_team() from public, anon;
grant execute on function public.team_invite(text) to authenticated;
grant execute on function public.my_team() to authenticated;
