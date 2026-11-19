-- Lunaxora: Kosten pro Konto (was kostet uns jeder Kunde?)
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run. Mehrfaches Ausführen schadet nicht.
-- Danach die Server-Funktion „assistant“ neu deployen – erst dann wird gezählt.
--
-- Was dazukommt (alles im eigenen Schema „kosten“, NICHT über die App-API
-- erreichbar – nur im Dashboard sichtbar):
--   kosten.nutzung       jede bezahlte Anfrage: Luna (Claude), Beleg lesen (Claude),
--                        Vorlesen (ElevenLabs), Sprache -> Text (Groq) – mit Tokens,
--                        Zeichen bzw. Sekunden
--   kosten.preise        Preisliste der Anbieter (in US-Dollar, hier änderbar)
--   kosten.einstellungen Dollarkurs (1 US-Dollar = … Euro)
--
-- Zum Ansehen (Table Editor -> Schema „kosten“ oder SQL Editor):
--   select * from kosten.pro_konto;   jedes Konto: Kosten diesen Monat, Vormonat, gesamt
--   select * from kosten.pro_kunde;   wie pro_konto, Business-Teams zusammengefasst
--   select * from kosten.pro_monat;   je Konto, Monat und Art (Luna, Beleg, …)
--   select * from kosten.einzeln;     jede einzelne Anfrage mit ihrem Preis
--
-- Die Preise werden beim Ansehen mit der aktuellen Preisliste berechnet: Ändert
-- sich ein Preis, einfach die Zeile in kosten.preise anpassen.

create schema if not exists kosten;
revoke all on schema kosten from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Verbrauch je Anfrage
-- ---------------------------------------------------------------------------
create table if not exists kosten.nutzung (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  art text not null check (art in ('luna', 'beleg', 'vorlesen', 'sprache')),
  anbieter text not null check (anbieter in ('anthropic', 'elevenlabs', 'groq')),
  modell text not null default '' check (char_length(modell) <= 100),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  zeichen integer not null default 0 check (zeichen >= 0),
  sekunden numeric(10, 2) not null default 0 check (sekunden >= 0)
);
create index if not exists nutzung_user_zeit_idx on kosten.nutzung (user_id, created_at);
alter table kosten.nutzung enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Preisliste (US-Dollar). modell = Anfang des Modellnamens; der längste
--    passende Eintrag gewinnt (z. B. „claude-sonnet-5-5“ passt auch auf
--    „claude-sonnet-5-5-20261001“).
-- ---------------------------------------------------------------------------
create table if not exists kosten.preise (
  anbieter text not null check (anbieter in ('anthropic', 'elevenlabs', 'groq')),
  modell text not null,
  usd_input_mtok numeric not null default 0,        -- je 1 Mio. Eingabe-Tokens
  usd_cache_write_mtok numeric not null default 0,  -- je 1 Mio. Tokens, die in den Cache geschrieben werden
  usd_cache_read_mtok numeric not null default 0,   -- je 1 Mio. Tokens aus dem Cache
  usd_output_mtok numeric not null default 0,       -- je 1 Mio. Ausgabe-Tokens
  usd_1000_zeichen numeric not null default 0,      -- Vorlesen: je 1.000 Zeichen
  usd_stunde numeric not null default 0,            -- Sprache -> Text: je Stunde Aufnahme
  min_sekunden numeric not null default 0,          -- Mindestlänge, die der Anbieter berechnet
  hinweis text,
  primary key (anbieter, modell)
);
alter table kosten.preise enable row level security;

-- Stand November 2026. Bestehende Zeilen bleiben, wie sie sind (eigene Änderungen gehen nicht verloren).
insert into kosten.preise (anbieter, modell, usd_input_mtok, usd_cache_write_mtok, usd_cache_read_mtok, usd_output_mtok, hinweis) values
  ('anthropic', 'claude-sonnet-5-5', 2, 2.5, 0.2, 10, 'Claude Sonnet 5.5 (Standard für Luna und Belege); Cache schreiben = 1,25 × Eingabe'),
  ('anthropic', 'claude-opus-5-5', 4, 5, 0.2, 20, 'Claude Opus 5.5 (nur, wenn das Secret ASSISTANT_MODEL darauf steht)')
on conflict (anbieter, modell) do nothing;
insert into kosten.preise (anbieter, modell, usd_1000_zeichen, hinweis) values
  ('elevenlabs', 'eleven_v4_turbo', 0.11, 'SCHÄTZUNG – an deinen ElevenLabs-Tarif anpassen: Tarifpreis in $ ÷ Credits im Tarif × Credits pro Zeichen × 1000')
on conflict (anbieter, modell) do nothing;
insert into kosten.preise (anbieter, modell, usd_stunde, min_sekunden, hinweis) values
  ('groq', 'whisper-large-v3-turbo', 0.04, 10, 'Groq berechnet jede Aufnahme mit mindestens 10 Sekunden'),
  ('groq', 'whisper-large-v3', 0.111, 10, 'nur, wenn das Secret TRANSCRIBE_MODEL darauf steht')
on conflict (anbieter, modell) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Dollarkurs
-- ---------------------------------------------------------------------------
create table if not exists kosten.einstellungen (
  id boolean primary key default true check (id),
  eur_pro_usd numeric not null default 0.86 check (eur_pro_usd > 0)
);
alter table kosten.einstellungen enable row level security;
insert into kosten.einstellungen (id) values (true) on conflict (id) do nothing;
comment on column kosten.einstellungen.eur_pro_usd is '1 US-Dollar = so viele Euro (ungefähr, bei Bedarf anpassen)';

-- ---------------------------------------------------------------------------
-- 4. Eintragen – nur die Server-Funktion „assistant“ darf das (service_role)
-- ---------------------------------------------------------------------------
create or replace function public.log_usage_cost(
  p_user uuid,
  p_art text,
  p_anbieter text,
  p_modell text default '',
  p_input integer default 0,
  p_cache_write integer default 0,
  p_cache_read integer default 0,
  p_output integer default 0,
  p_zeichen integer default 0,
  p_sekunden numeric default 0
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into kosten.nutzung
    (user_id, art, anbieter, modell, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, zeichen, sekunden)
  values
    (p_user, p_art, p_anbieter, left(coalesce(p_modell, ''), 100),
     greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_cache_write, 0), 0),
     greatest(coalesce(p_cache_read, 0), 0), greatest(coalesce(p_output, 0), 0),
     greatest(coalesce(p_zeichen, 0), 0), greatest(coalesce(p_sekunden, 0), 0));
$$;
revoke all on function public.log_usage_cost(uuid, text, text, text, integer, integer, integer, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.log_usage_cost(uuid, text, text, text, integer, integer, integer, integer, integer, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Hilfen
-- ---------------------------------------------------------------------------
-- Anfang des Monats (deutsche Zeit); 0 = dieser Monat, 1 = Vormonat …
create or replace function kosten.monatsbeginn(p_zurueck integer default 0)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (date_trunc('month', now() at time zone 'Europe/Berlin') - make_interval(months => p_zurueck)) at time zone 'Europe/Berlin';
$$;

-- Zu wessen Business gehört das Konto? Teammitglied -> Inhaber, sonst das Konto selbst.
-- (Funktioniert auch, wenn das Feinschliff-Skript mit den Teams noch nicht gelaufen ist.)
create or replace function kosten.inhaber(p_user uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  return coalesce((select t.owner_id from public.team_members t where t.member_id = p_user), p_user);
exception when undefined_table then
  return p_user;
end;
$$;

-- Abo des Kontos (Gratis, Testphase, Pro, Business) – auch ohne Abo-Skript
create or replace function kosten.abo(p_user uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return public.nexora_plan(p_user);
exception when undefined_function then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Ansichten
-- ---------------------------------------------------------------------------
create or replace view kosten.einzeln as
select
  n.id,
  n.created_at,
  n.user_id,
  u.email,
  n.art,
  n.anbieter,
  n.modell,
  n.input_tokens,
  n.cache_write_tokens,
  n.cache_read_tokens,
  n.output_tokens,
  n.zeichen,
  n.sekunden,
  p.modell is not null as preis_bekannt,
  round(
    coalesce(
      (n.input_tokens * p.usd_input_mtok
        + n.cache_write_tokens * p.usd_cache_write_mtok
        + n.cache_read_tokens * p.usd_cache_read_mtok
        + n.output_tokens * p.usd_output_mtok) / 1000000
      + n.zeichen * p.usd_1000_zeichen / 1000
      + case when n.anbieter = 'groq' then greatest(n.sekunden, p.min_sekunden) * p.usd_stunde / 3600 else 0 end,
      0
    ) * e.eur_pro_usd,
    6
  ) as kosten_eur
from kosten.nutzung n
cross join kosten.einstellungen e
left join auth.users u on u.id = n.user_id
left join lateral (
  select *
  from kosten.preise pr
  where pr.anbieter = n.anbieter and starts_with(n.modell, pr.modell)
  order by length(pr.modell) desc
  limit 1
) p on true;

create or replace view kosten.pro_konto as
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
)
select
  u.email,
  coalesce(nullif(trim(b.company_name), ''), nullif(trim(pf.display_name), '')) as name,
  kosten.abo(u.id) as abo,
  case when kosten.inhaber(u.id) <> u.id then (select o.email from auth.users o where o.id = kosten.inhaber(u.id)) end as team_von,
  round(coalesce(k.monat, 0), 2) as kosten_monat_eur,
  round(coalesce(k.vormonat, 0), 2) as kosten_vormonat_eur,
  round(coalesce(k.gesamt, 0), 2) as kosten_gesamt_eur,
  coalesce(k.luna, 0) as luna_nachrichten_monat,
  coalesce(k.belege, 0) as belege_monat,
  coalesce(k.zeichen, 0) as vorlese_zeichen_monat,
  round(coalesce(k.sekunden, 0) / 60, 1) as sprache_minuten_monat,
  coalesce(k.ohne_preis, 0) as anfragen_ohne_preis,
  k.zuletzt as zuletzt_genutzt,
  u.created_at as konto_seit,
  u.id as user_id
from auth.users u
left join k on k.user_id = u.id
left join public.profiles pf on pf.id = u.id
left join public.business_settings b on b.user_id = u.id
order by kosten_monat_eur desc, kosten_gesamt_eur desc, u.created_at;

-- Ein Business-Team = ein Kunde (Inhaber + Mitglieder zusammen)
create or replace view kosten.pro_kunde as
with k as (
  select pk.*, kosten.inhaber(pk.user_id) as inhaber_id from kosten.pro_konto pk
),
t as (
  select
    inhaber_id,
    count(*) as konten,
    sum(kosten_monat_eur) as kosten_monat_eur,
    sum(kosten_vormonat_eur) as kosten_vormonat_eur,
    sum(kosten_gesamt_eur) as kosten_gesamt_eur,
    sum(luna_nachrichten_monat) as luna_nachrichten_monat,
    sum(belege_monat) as belege_monat,
    sum(vorlese_zeichen_monat) as vorlese_zeichen_monat,
    sum(sprache_minuten_monat) as sprache_minuten_monat,
    max(zuletzt_genutzt) as zuletzt_genutzt
  from k
  group by inhaber_id
)
select
  o.email,
  o.name,
  o.abo,
  t.konten,
  t.kosten_monat_eur,
  t.kosten_vormonat_eur,
  t.kosten_gesamt_eur,
  t.luna_nachrichten_monat,
  t.belege_monat,
  t.vorlese_zeichen_monat,
  t.sprache_minuten_monat,
  t.zuletzt_genutzt,
  t.inhaber_id as user_id
from t
join kosten.pro_konto o on o.user_id = t.inhaber_id
order by t.kosten_monat_eur desc, t.kosten_gesamt_eur desc;

create or replace view kosten.pro_monat as
select
  to_char(e.created_at at time zone 'Europe/Berlin', 'YYYY-MM') as monat,
  e.email,
  e.art,
  count(*) as anfragen,
  round(sum(e.kosten_eur), 4) as kosten_eur,
  sum(e.input_tokens + e.cache_write_tokens + e.cache_read_tokens) as eingabe_tokens,
  sum(e.output_tokens) as ausgabe_tokens,
  sum(e.zeichen) as zeichen,
  round(sum(e.sekunden) / 60, 1) as minuten,
  e.user_id
from kosten.einzeln e
group by 1, e.email, e.art, e.user_id
order by monat desc, kosten_eur desc;

revoke all on all tables in schema kosten from public, anon, authenticated;
revoke all on all functions in schema kosten from public, anon, authenticated;
