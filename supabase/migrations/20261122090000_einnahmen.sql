-- ===========================================================================
-- Einnahmen je Konto/Kunde – neben den Kosten (baut auf 20261121090000_kosten.sql auf)
--
-- Im SQL Editor:
--   select * from kosten.pro_konto;   -- je Konto: Einnahmen, Kosten, Gewinn
--   select * from kosten.pro_kunde;   -- je Kunde (Business-Team zusammengefasst)
--   select * from kosten.zahlungen order by bezahlt_am desc;
--
-- Woher die Einnahmen kommen:
--   * Stripe: die Server-Funktion billing trägt jede bezahlte Rechnung (invoice.paid) ein.
--   * Von Hand (z. B. Überweisung):
--       insert into kosten.zahlungen (user_id, betrag_eur, intervall, stufe, beschreibung)
--       values ((select id from auth.users where email = 'kunde@beispiel.de'), 23.99, 'month', 'pro', 'Überweisung');
--
-- Wie die Kosten: eigenes Schema, nicht über die App-API erreichbar. Mehrfach ausführbar.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Zahlungen (was wirklich eingegangen ist)
-- ---------------------------------------------------------------------------
create table if not exists kosten.zahlungen (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  bezahlt_am timestamptz not null default now(),
  -- Endbetrag (Kleinunternehmer: ohne Umsatzsteuer); Erstattungen negativ
  betrag_eur numeric(10, 2) not null check (betrag_eur <> 0),
  quelle text not null default 'manuell' check (quelle in ('stripe', 'apple', 'google', 'manuell')),
  intervall text check (intervall in ('month', 'year')),
  stufe text check (stufe in ('pro', 'business')),
  -- Stripe-Rechnungs-ID: dieselbe Rechnung wird nie doppelt gezählt
  rechnung text unique,
  beschreibung text check (char_length(beschreibung) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists zahlungen_user_idx on kosten.zahlungen (user_id, bezahlt_am);
alter table kosten.zahlungen enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Abo-Preise (für den Abo-Wert pro Monat; bei Preisänderung hier anpassen)
-- ---------------------------------------------------------------------------
create table if not exists kosten.abo_preise (
  stufe text not null check (stufe in ('pro', 'business')),
  intervall text not null check (intervall in ('month', 'year')),
  eur numeric(10, 2) not null,
  primary key (stufe, intervall)
);
alter table kosten.abo_preise enable row level security;

insert into kosten.abo_preise (stufe, intervall, eur) values
  ('pro', 'month', 23.99),
  ('pro', 'year', 239.90),
  ('business', 'month', 150.00),
  ('business', 'year', 1500.00)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Eintragen durch die Server-Funktion billing (nur mit Service-Schlüssel)
-- ---------------------------------------------------------------------------
create or replace function public.log_payment(
  p_user uuid,
  p_betrag numeric,
  p_quelle text default 'stripe',
  p_intervall text default null,
  p_stufe text default null,
  p_rechnung text default null,
  p_beschreibung text default null,
  p_bezahlt_am timestamptz default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into kosten.zahlungen (user_id, betrag_eur, quelle, intervall, stufe, rechnung, beschreibung, bezahlt_am)
  values (
    p_user,
    round(p_betrag, 2),
    p_quelle,
    case when p_intervall in ('month', 'year') then p_intervall end,
    case when p_stufe in ('pro', 'business') then p_stufe end,
    nullif(p_rechnung, ''),
    left(p_beschreibung, 300),
    coalesce(p_bezahlt_am, now())
  )
  on conflict (rechnung) do nothing;
$$;
revoke all on function public.log_payment(uuid, numeric, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.log_payment(uuid, numeric, text, text, text, text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Abo-Wert pro Monat: läuft ein bezahltes Abo, was bringt es im Monat?
--    (Jahresabo ÷ 12; Testphase, Gutschein und „manuell“ zählen 0 €)
-- ---------------------------------------------------------------------------
create or replace function kosten.abo_monat(p_user uuid)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  s record;
  iv text;
  preis numeric;
begin
  select status, source, tier, current_period_end into s from public.subscriptions where user_id = p_user;
  if not found
     or s.source not in ('stripe', 'apple', 'google')
     or s.status not in ('active', 'canceled')
     or (s.current_period_end is not null and s.current_period_end <= now()) then
    return 0;
  end if;
  -- Intervall aus der letzten Zahlung (sonst Monatspreis)
  select z.intervall into iv from kosten.zahlungen z
  where z.user_id = p_user and z.intervall is not null and z.betrag_eur > 0
  order by z.bezahlt_am desc limit 1;
  select case when coalesce(iv, 'month') = 'year' then p.eur / 12 else p.eur end into preis
  from kosten.abo_preise p
  where p.stufe = coalesce(s.tier, 'pro') and p.intervall = coalesce(iv, 'month');
  return round(coalesce(preis, 0), 2);
exception when undefined_table or undefined_column then
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ansichten neu – jetzt mit Einnahmen und Gewinn
-- ---------------------------------------------------------------------------
drop view if exists kosten.pro_kunde;
drop view if exists kosten.pro_konto;

create view kosten.pro_konto as
with k as (
  select
    user_id,
    sum(kosten_eur) filter (where created_at >= kosten.monatsbeginn(0)) as monat,
    sum(kosten_eur) filter (where created_at >= kosten.monatsbeginn(1) and created_at < kosten.monatsbeginn(0)) as vormonat,
    sum(kosten_eur) as gesamt,
    count(*) filter (where art = 'luna' and created_at >= kosten.monatsbeginn(0)) as luna,
    count(*) filter (where art = 'beleg' and created_at >= kosten.monatsbeginn(0)) as belege,
    sum(zeichen) filter (where art = 'vorlesen' and created_at >= kosten.monatsbeginn(0)) as zeichen,
    sum(sekunden) filter (where art = 'sprache' and created_at >= kosten.monatsbeginn(0)) as sekunden,
    count(*) filter (where not preis_bekannt) as ohne_preis,
    max(created_at) as zuletzt
  from kosten.einzeln
  group by user_id
),
z as (
  select
    user_id,
    sum(betrag_eur) filter (where bezahlt_am >= kosten.monatsbeginn(0)) as monat,
    sum(betrag_eur) filter (where bezahlt_am >= kosten.monatsbeginn(1) and bezahlt_am < kosten.monatsbeginn(0)) as vormonat,
    sum(betrag_eur) as gesamt,
    max(bezahlt_am) as zuletzt
  from kosten.zahlungen
  group by user_id
),
a as (
  select u.id as user_id, kosten.abo_monat(u.id) as abo_monat from auth.users u
)
select
  u.email,
  coalesce(nullif(trim(b.company_name), ''), nullif(trim(pf.display_name), '')) as name,
  kosten.abo(u.id) as abo,
  case when kosten.inhaber(u.id) <> u.id then (select o.email from auth.users o where o.id = kosten.inhaber(u.id)) end as team_von,
  round(coalesce(z.monat, 0), 2) as einnahmen_monat_eur,
  round(coalesce(k.monat, 0), 2) as kosten_monat_eur,
  round(a.abo_monat - coalesce(k.monat, 0), 2) as gewinn_monat_eur,
  a.abo_monat::numeric(10, 2) as abo_wert_monat_eur,
  round(coalesce(z.gesamt, 0), 2) as einnahmen_gesamt_eur,
  round(coalesce(k.gesamt, 0), 2) as kosten_gesamt_eur,
  round(coalesce(z.gesamt, 0) - coalesce(k.gesamt, 0), 2) as gewinn_gesamt_eur,
  round(coalesce(z.vormonat, 0), 2) as einnahmen_vormonat_eur,
  round(coalesce(k.vormonat, 0), 2) as kosten_vormonat_eur,
  coalesce(k.luna, 0) as luna_nachrichten_monat,
  coalesce(k.belege, 0) as belege_monat,
  coalesce(k.zeichen, 0) as vorlese_zeichen_monat,
  round(coalesce(k.sekunden, 0) / 60, 1) as sprache_minuten_monat,
  coalesce(k.ohne_preis, 0) as anfragen_ohne_preis,
  z.zuletzt as letzte_zahlung,
  k.zuletzt as zuletzt_genutzt,
  u.created_at as konto_seit,
  u.id as user_id
from auth.users u
join a on a.user_id = u.id
left join k on k.user_id = u.id
left join z on z.user_id = u.id
left join public.profiles pf on pf.id = u.id
left join public.business_settings b on b.user_id = u.id
order by kosten_monat_eur desc, kosten_gesamt_eur desc, u.created_at;

-- Ein Business-Team = ein Kunde (Inhaber + Mitglieder zusammen; bezahlt wird beim Inhaber)
create view kosten.pro_kunde as
with k as (
  select pk.*, kosten.inhaber(pk.user_id) as inhaber_id from kosten.pro_konto pk
),
t as (
  select
    inhaber_id,
    count(*) as konten,
    sum(einnahmen_monat_eur) as einnahmen_monat_eur,
    sum(kosten_monat_eur) as kosten_monat_eur,
    sum(abo_wert_monat_eur) as abo_wert_monat_eur,
    sum(einnahmen_gesamt_eur) as einnahmen_gesamt_eur,
    sum(kosten_gesamt_eur) as kosten_gesamt_eur,
    sum(einnahmen_vormonat_eur) as einnahmen_vormonat_eur,
    sum(kosten_vormonat_eur) as kosten_vormonat_eur,
    sum(luna_nachrichten_monat) as luna_nachrichten_monat,
    sum(belege_monat) as belege_monat,
    sum(vorlese_zeichen_monat) as vorlese_zeichen_monat,
    sum(sprache_minuten_monat) as sprache_minuten_monat,
    max(letzte_zahlung) as letzte_zahlung,
    max(zuletzt_genutzt) as zuletzt_genutzt
  from k
  group by inhaber_id
)
select
  o.email,
  o.name,
  o.abo,
  t.konten,
  t.einnahmen_monat_eur,
  t.kosten_monat_eur,
  t.abo_wert_monat_eur - t.kosten_monat_eur as gewinn_monat_eur,
  t.abo_wert_monat_eur,
  t.einnahmen_gesamt_eur,
  t.kosten_gesamt_eur,
  t.einnahmen_gesamt_eur - t.kosten_gesamt_eur as gewinn_gesamt_eur,
  t.einnahmen_vormonat_eur,
  t.kosten_vormonat_eur,
  t.luna_nachrichten_monat,
  t.belege_monat,
  t.vorlese_zeichen_monat,
  t.sprache_minuten_monat,
  t.letzte_zahlung,
  t.zuletzt_genutzt,
  t.inhaber_id as user_id
from t
join kosten.pro_konto o on o.user_id = t.inhaber_id
order by t.kosten_monat_eur desc, t.kosten_gesamt_eur desc;

revoke all on all tables in schema kosten from public, anon, authenticated;
revoke all on all functions in schema kosten from public, anon, authenticated;
