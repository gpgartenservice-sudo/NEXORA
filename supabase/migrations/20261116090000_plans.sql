-- NEXORA: Abo (Gratis / Pro) – Testphase, Gratis-Grenzen, Pro-Funktionen
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: die bisherigen Skripte (Angebote/Rechnungen, Mahnwesen,
-- Termine, Angebote online).
--
-- So funktioniert es:
-- * Jeder Nutzer bekommt beim ersten Öffnen nach diesem Skript 14 Tage Pro gratis
--   (auch bestehende Nutzer – die Testphase startet dann).
-- * Danach „Gratis“ – außer es gibt ein aktives Abo (Tabelle subscriptions,
--   später vom Bezahldienst gesetzt; zum Freischalten von Hand siehe supabase/README.md).
-- * Gratis: 20 Nexy-Nachrichten und 5 ausgelesene Belege pro Monat.
--   Pro: bis 300 je Monat (faire Nutzung).
-- * Nur mit Pro (geprüft in der Datenbank bzw. in den Server-Funktionen):
--   Angebots-Link zum Online-Annehmen, 1. und letzte Mahnung, Kalender-Abo,
--   E-Mails direkt aus der App.

-- ---------------------------------------------------------------------------
-- Abo je Nutzer (lesen ja, ändern nur Bezahldienst/Admin)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'trial' check (status in ('trial', 'active', 'canceled', 'expired')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  source text not null default 'trial' check (source in ('trial', 'manual', 'apple', 'google', 'stripe')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- Verbrauch je Monat (nur über die Funktionen unten änderbar)
-- ---------------------------------------------------------------------------
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  kind text not null check (kind in ('nexy', 'receipt')),
  used integer not null default 0 check (used >= 0),
  primary key (user_id, month, kind)
);

alter table public.usage_counters enable row level security;
drop policy if exists "usage_counters_select_own" on public.usage_counters;
create policy "usage_counters_select_own" on public.usage_counters
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.usage_counters from anon, authenticated;
grant select on public.usage_counters to authenticated;

-- ---------------------------------------------------------------------------
-- Interne Helfer (nur für die Funktionen unten, nicht direkt aufrufbar)
-- ---------------------------------------------------------------------------

-- Testphase anlegen, falls es noch keinen Eintrag gibt
create or replace function public.nexora_ensure_subscription(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, status, trial_ends_at, source)
  values (p_user, 'trial', now() + interval '14 days', 'trial')
  on conflict (user_id) do nothing;
end;
$$;

-- 'pro' (bezahlt), 'trial' (Testphase läuft) oder 'free'
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
  if s.status = 'active' and (s.current_period_end is null or s.current_period_end > now()) then return 'pro'; end if;
  if s.status = 'canceled' and s.current_period_end is not null and s.current_period_end > now() then return 'pro'; end if;
  if s.status = 'trial' and s.trial_ends_at is not null and s.trial_ends_at > now() then return 'trial'; end if;
  return 'free';
end;
$$;

-- Grenze je Monat
create or replace function public.nexora_limit(p_plan text, p_kind text)
returns integer
language sql
immutable
as $$
  select case
    when p_plan = 'free' and p_kind = 'nexy' then 20
    when p_plan = 'free' and p_kind = 'receipt' then 5
    else 300
  end;
$$;

-- Monat in deutscher Zeit (z. B. '2026-11')
create or replace function public.nexora_month()
returns text
language sql
stable
as $$
  select to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM');
$$;

revoke all on function public.nexora_ensure_subscription(uuid) from public, anon, authenticated;
revoke all on function public.nexora_plan(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Für die App: eigenes Abo + Verbrauch
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
    'usage', jsonb_build_object(
      'nexy', jsonb_build_object(
        'used', coalesce((select used from public.usage_counters where user_id = uid and month = m and kind = 'nexy'), 0),
        'limit', public.nexora_limit(p, 'nexy')),
      'receipt', jsonb_build_object(
        'used', coalesce((select used from public.usage_counters where user_id = uid and month = m and kind = 'receipt'), 0),
        'limit', public.nexora_limit(p, 'receipt'))
    )
  );
end;
$$;

-- Für die Server-Funktion "assistant": eine Nexy-Nachricht bzw. ein Beleg verbrauchen
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
  if p_kind not in ('nexy', 'receipt') then raise exception 'invalid_kind' using errcode = '22023'; end if;
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

-- Zurückgeben, wenn die Anfrage danach doch nicht geklappt hat
create or replace function public.refund_quota(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.usage_counters set used = used - 1
  where user_id = auth.uid() and month = public.nexora_month() and kind = p_kind and used > 0;
end;
$$;

revoke all on function public.my_plan() from public, anon;
revoke all on function public.consume_quota(text) from public, anon;
revoke all on function public.refund_quota(text) from public, anon;
grant execute on function public.my_plan() to authenticated;
grant execute on function public.consume_quota(text) to authenticated;
grant execute on function public.refund_quota(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pro-Funktionen in der Datenbank absichern
-- (Fehler 'pro_required' kommt in der App als HTTP 402 an)
-- ---------------------------------------------------------------------------
create or replace function public.nexora_require_pro()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if; -- z. B. Admin im SQL-Editor
  perform public.nexora_ensure_subscription(uid);
  if public.nexora_plan(uid) = 'free' then
    raise exception 'pro_required' using errcode = 'PT402';
  end if;
end;
$$;
revoke all on function public.nexora_require_pro() from public, anon, authenticated;

-- Angebots-Link zum Online-Annehmen
create or replace function public.nexora_check_offer_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.public_token is not null and new.public_token is distinct from old.public_token then
    perform public.nexora_require_pro();
  end if;
  return new;
end;
$$;
drop trigger if exists documents_offer_link_pro on public.documents;
create trigger documents_offer_link_pro before update of public_token on public.documents
  for each row execute function public.nexora_check_offer_link();

-- 1. und letzte Mahnung (Zahlungserinnerung und Bewertungsbitte bleiben gratis)
create or replace function public.nexora_check_dunning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind in ('dunning1', 'dunning2') then
    perform public.nexora_require_pro();
  end if;
  return new;
end;
$$;
drop trigger if exists invoice_followups_pro on public.invoice_followups;
create trigger invoice_followups_pro before insert on public.invoice_followups
  for each row execute function public.nexora_check_dunning();

-- Kalender-Abo (neuer Link)
create or replace function public.nexora_check_calendar_feed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.nexora_require_pro();
  return new;
end;
$$;
drop trigger if exists calendar_feeds_pro on public.calendar_feeds;
create trigger calendar_feeds_pro before insert on public.calendar_feeds
  for each row execute function public.nexora_check_calendar_feed();
