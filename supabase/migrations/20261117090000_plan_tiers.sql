-- NEXORA: Abo-Stufen Gratis / Pro / Business – neue Grenzen, Vorlesen zählt mit
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: 20261116090000_plans.sql.
--
-- Grenzen je Kalendermonat (Kostenrechnung November 2026, Luna auf Sonnet 5.5):
--
--   Abo        | Luna-Nachrichten | Belege | Vorlesen (Abschnitte à max. 400 Zeichen)
--   -----------+------------------+--------+-----------------------------------------
--   Gratis     |        15        |    3   |    30
--   Testphase  |        50        |   20   |    70
--   Pro        |       100        |   50   |   120
--   Business   |       200        |  150   |   220
--
-- Business = alles aus Pro mit mehr Kontingent (Spalte subscriptions.tier).

-- ---------------------------------------------------------------------------
-- Abo-Stufe (nur für bezahlte Abos wichtig; Bezahldienst/Admin setzt sie)
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists tier text not null default 'pro';
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions add constraint subscriptions_tier_check check (tier in ('pro', 'business'));

-- Vorlesen als eigener Zähler
alter table public.usage_counters drop constraint if exists usage_counters_kind_check;
alter table public.usage_counters
  add constraint usage_counters_kind_check check (kind in ('nexy', 'receipt', 'voice'));

-- ---------------------------------------------------------------------------
-- 'business' / 'pro' (bezahlt), 'trial' (Testphase läuft) oder 'free'
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

-- Grenze je Monat
create or replace function public.nexora_limit(p_plan text, p_kind text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'business' then case p_kind when 'nexy' then 200 when 'receipt' then 150 else 220 end
    when 'pro'      then case p_kind when 'nexy' then 100 when 'receipt' then 50  else 120 end
    when 'trial'    then case p_kind when 'nexy' then 50  when 'receipt' then 20  else 70  end
    else                 case p_kind when 'nexy' then 15  when 'receipt' then 3   else 30  end
  end;
$$;

-- ---------------------------------------------------------------------------
-- Für die App: eigenes Abo + Verbrauch (jetzt mit Vorlesen)
-- ---------------------------------------------------------------------------
create or replace function public.my_plan()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
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

-- Für die Server-Funktion "assistant": eine Nachricht, einen Beleg bzw. einmal Vorlesen verbrauchen
create or replace function public.consume_quota(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
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

revoke all on function public.my_plan() from public, anon;
revoke all on function public.consume_quota(text) from public, anon;
grant execute on function public.my_plan() to authenticated;
grant execute on function public.consume_quota(text) to authenticated;
